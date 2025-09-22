// battle.js (最終修正版 - ユニークID対応)

import { enemyData, enemyGroups } from './enemies.js';

// DOM Elements
const enemyPartyEl = document.getElementById('enemy-party');
const playerPartyEl = document.getElementById('player-party');
const messageLogEl = document.getElementById('message-log');
const commandAreaEl = document.getElementById('command-area');
const battleScreenEl = document.getElementById('battle-screen');
const goButton = document.getElementById('go-button');
const partyScreen = document.getElementById('party-screen');

// Game State
let currentPlayerParty;
let opponentParty;
let currentEnemies;
let activePlayerIndex = 0;
let currentGroupIndex = 0;
let currentTurn = 0;
let isBattleOngoing = false;
let myPartyReady = false;
let opponentPartyReady = false;

// ユニークID生成カウンター
let uniqueIdCounter = 0;

// --- Utility Functions ---

function generateUniqueId() {
    return `unique_${Date.now()}_${uniqueIdCounter++}`;
}

function logMessage(message, type = '') {
    const p = document.createElement('p');
    p.textContent = message;
    if (type) {
        p.classList.add('log-message', type);
    }
    messageLogEl.appendChild(p);
    messageLogEl.scrollTop = messageLogEl.scrollHeight;
}

function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// --- Display Update Functions ---

function updatePartyDisplay(partyEl, partyData) {
    if (!partyData) return;
    partyData.forEach((member, index) => {
        const memberEl = partyEl.children[index];
        if (!memberEl) return;

        const hpFill = memberEl.querySelector('.hp-bar-fill');
        const hpText = memberEl.querySelector('.hp-text');
        const mpFill = memberEl.querySelector('.mp-bar-fill');
        const mpText = memberEl.querySelector('.mp-text');

        const hpPercentage = (member.status.hp / member.status.maxHp) * 100;
        hpFill.style.width = `${hpPercentage}%`;
        if (hpText) hpText.textContent = `${member.status.hp}/${member.status.maxHp}`;

        if (mpFill) {
            const mpPercentage = (member.status.mp / member.status.maxMp) * 100;
            mpFill.style.width = `${mpPercentage}%`;
        }
        if (mpText) mpText.textContent = `${member.status.mp}/${member.status.maxMp}`;

        if (member.status.hp <= 0) {
            memberEl.classList.add('fainted');
        } else {
            memberEl.classList.remove('fainted');
        }
    });
}

function updatePlayerDisplay() {
    updatePartyDisplay(playerPartyEl, currentPlayerParty);
}

function updateEnemyDisplay() {
    const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
    updatePartyDisplay(enemyPartyEl, enemies);
}

// --- Battle Initialization ---

function initializeParty(party, partyType = 'player') {
    return party.map((p, index) => {
        const member = deepCopy(p);
        // ユニークIDを生成（元のIDは保持）
        member.uniqueId = generateUniqueId();
        member.originalId = member.id; // 元のIDを保存
        member.partyType = partyType; // パーティータイプを追加
        member.partyIndex = index; // パーティー内のインデックス
        member.effects = {};
        
        if (member.originalId === 'char06') {
            member.targetMemory = { lastTargetId: null, missed: false };
        }
        return member;
    });
}

async function startBattle(partyMembers) {
    logMessage('戦闘開始！');
    isBattleOngoing = true;
    currentTurn = 0;

    // 自分のパーティーを初期化（プレイヤータイプとして）
    currentPlayerParty = initializeParty(partyMembers, window.isHost() ? 'host' : 'client');
    myPartyReady = true;

    if (window.isOnlineMode()) {
        logMessage('オンライン対戦を開始します！');
        window.sendData({ type: 'party_data', party: currentPlayerParty });
        logMessage('相手のパーティー情報を待機中...');

        if (opponentPartyReady) {
            renderBattle();
            if (window.isHost()) {
                logMessage('両者の準備が整いました。戦闘を開始します！');
                window.sendData({ type: 'start_battle' });
                await battleLoop();
            }
        }
    } else {
        currentGroupIndex = 0;
        await startNextGroup();
    }
}

function handleOpponentParty(partyData) {
    if (!partyData) {
        console.error('Received empty party data.');
        return;
    }
    
    // 相手のパーティーを初期化（相手タイプとして）
    opponentParty = partyData.map((p, index) => {
        const member = deepCopy(p);
        // 相手から受信したユニークIDをそのまま使用
        if (!member.uniqueId) {
            member.uniqueId = generateUniqueId();
        }
        member.originalId = member.id || member.originalId;
        member.partyType = window.isHost() ? 'client' : 'host';
        member.partyIndex = index;
        member.effects = member.effects || {};
        
        if (member.originalId === 'char06') {
            member.targetMemory = member.targetMemory || { lastTargetId: null, missed: false };
        }
        return member;
    });
    
    opponentPartyReady = true;
    logMessage('相手のパーティー情報を受信しました！');

    if (myPartyReady) {
        renderBattle();
        if (window.isHost()) {
            logMessage('両者の準備が整いました。戦闘を開始します！');
            window.sendData({ type: 'start_battle' });
            battleLoop();
        }
    }
}

function startBattleClientSide() {
    if (isBattleOngoing) return;
    logMessage('ホストが戦闘を開始しました。');
    isBattleOngoing = true;
    renderBattle();
}

async function startNextGroup() {
    if (currentGroupIndex >= enemyGroups.length) {
        handleGameWin();
        return;
    }
    const group = enemyGroups[currentGroupIndex];
    logMessage(`${group.name}との戦闘！`);
    currentEnemies = initializeParty(group.enemies.map(id => enemyData.find(e => e.id === id)), 'enemy');
    renderBattle();
    await battleLoop();
}

// --- Core Battle Logic ---

async function battleLoop() {
    if (window.isOnlineMode() && !window.isHost()) {
        logMessage("ホストの処理を待っています...");
        return;
    }

    while (isBattleOngoing) {
        if (isBattleOver()) {
            handleBattleEnd();
            break;
        }

        const turnStartMessage = `=== ターン ${currentTurn + 1} 開始 ===`;
        logMessage(turnStartMessage, 'turn-start');
        if (window.isOnlineMode()) {
            window.sendData({ type: 'log_message', message: turnStartMessage, messageType: 'turn-start' });
        }

        const combatants = window.isOnlineMode()
            ? [...currentPlayerParty, ...opponentParty]
            : [...currentPlayerParty, ...currentEnemies];

        const aliveCombatants = combatants.filter(c => c.status.hp > 0);
        aliveCombatants.sort((a, b) => b.status.spd - a.status.spd || Math.random() - 0.5);

        const actionOrder = aliveCombatants.map(c => c.name).join(' → ');
        logMessage(`行動順: ${actionOrder}`);
        if (window.isOnlineMode()) {
            window.sendData({ type: 'log_message', message: `行動順: ${actionOrder}` });
        }

        for (const combatant of aliveCombatants) {
            if (isBattleOver()) break;
            if (combatant.status.hp <= 0) continue;

            const actionSkipped = processStatusEffects(combatant);
            if (actionSkipped) continue;

            // パーティータイプで行動者を判定
            const isMyCharacter = combatant.partyType === (window.isHost() ? 'host' : 'client');

            if (window.isOnlineMode()) {
                if (isMyCharacter) {
                    await playerTurn(combatant);
                } else {
                    window.sendData({ type: 'request_action', actorUniqueId: combatant.uniqueId });
                    logMessage(`${combatant.name}の行動を待っています...`);
                    await waitForAction();
                }
            } else {
                if (isMyCharacter) {
                    await playerTurn(combatant);
                } else {
                    await enemyTurn(combatant);
                }
            }
            
            if (window.isOnlineMode()) {
                syncGameState();
            }
        }

        processEndTurnEffects(aliveCombatants);
        currentTurn++;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

let resolveActionPromise;
function waitForAction() {
    return new Promise(resolve => {
        resolveActionPromise = resolve;
    });
}

// --- Turn Handling ---

async function playerTurn(player) {
    logMessage(`${player.name}のターン！`, 'character-turn');
    commandAreaEl.classList.remove('hidden');
    updateCommandMenu(player);

    return new Promise(resolve => {
        const handleCommand = async (event) => {
            const target = event.target;
            let actionData = null;

            if (target.matches('.action-attack')) {
                logMessage('攻撃対象を選んでください。');
                const targetInfo = await selectTarget();
                if (targetInfo) {
                    actionData = { 
                        action: 'attack', 
                        actorUniqueId: player.uniqueId, 
                        targetUniqueId: targetInfo.target.uniqueId 
                    };
                }
            } else if (target.matches('.action-skill')) {
                const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
                if (skillMenuEl) {
                    skillMenuEl.classList.toggle('hidden');
                }
                return;
            } else if (target.matches('.skill-button')) {
                const skillName = target.textContent;
                const skill = player.active.find(s => s.name === skillName);
                if (skill) {
                    let mpCost = skill.mp;
                    if (player.effects.curse) {
                        mpCost = Math.floor(mpCost * 1.5);
                        logMessage(`${player.name}の「呪縛」により、MP消費が${mpCost}に増加した。`);
                    }

                    if (player.status.mp < mpCost) {
                        logMessage(`MPが足りません！`);
                        return;
                    }

                    player.status.mp -= mpCost;
                    logMessage(`${player.name}は${skill.name}を使った！`);
                    
                    const skillExecuted = await executeSkill(player, skill);
                    if (skillExecuted) {
                        actionData = { 
                            action: 'skill', 
                            actorUniqueId: player.uniqueId, 
                            skillName: skill.name 
                        };
                    }
                }
            } else if (target.matches('.action-defend')) {
                logMessage(`${player.name}は防御した。`);
                player.isDefending = true;
                actionData = { action: 'defend', actorUniqueId: player.uniqueId };
            }

            if (actionData) {
                commandAreaEl.removeEventListener('click', handleCommand);
                commandAreaEl.classList.add('hidden');
                
                if (window.isOnlineMode()) {
                    if (window.isHost()) {
                        executeAction(actionData);
                    } else {
                        window.sendData({ type: 'execute_action', ...actionData });
                    }
                } else {
                    executeAction(actionData);
                }
                resolve();
            }
        };
        commandAreaEl.addEventListener('click', handleCommand);
    });
}

async function enemyTurn(enemy) {
    logMessage(`${enemy.name}のターン！`);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
    if (alivePlayers.length > 0) {
        const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        executeAction({ 
            action: 'attack', 
            actorUniqueId: enemy.uniqueId, 
            targetUniqueId: target.uniqueId 
        });
    }
}

// --- Action Execution ---

function executeAction(data) {
    const allCombatants = window.isOnlineMode()
        ? [...currentPlayerParty, ...opponentParty]
        : [...currentPlayerParty, ...currentEnemies];

    // ユニークIDで行動者と対象を検索
    const actor = allCombatants.find(c => c.uniqueId === data.actorUniqueId);
    const target = data.targetUniqueId ? allCombatants.find(c => c.uniqueId === data.targetUniqueId) : null;

    if (!actor) {
        console.error('Actor not found with uniqueId:', data.actorUniqueId);
        logMessage(`エラー: 行動者が見つかりません。`, 'error');
        return;
    }

    switch (data.action) {
        case 'attack':
            if (target) {
                performAttack(actor, target);
            }
            break;
        case 'defend':
            logMessage(`${actor.name}は防御した。`);
            actor.isDefending = true;
            break;
        case 'skill':
            logMessage(`${actor.name}は${data.skillName}を使った！`);
            break;
    }

    updatePlayerDisplay();
    updateEnemyDisplay();
    
    if (window.isOnlineMode() && window.isHost()) {
        syncGameState();
    }
}

function performAttack(attacker, defender) {
    const { damage, critical, dodged, specialEffectLog } = calculateDamage(attacker, defender);

    if (specialEffectLog) logMessage(specialEffectLog, 'status-effect');

    if (dodged) {
        logMessage(`${defender.name}は攻撃を回避した！`, 'status-effect');
    } else {
        if (critical) logMessage(`会心の一撃！`, 'special-event');
        logMessage(`${attacker.name}の攻撃！ ${defender.name}に${damage}のダメージ！`, 'damage');
        defender.status.hp = Math.max(0, defender.status.hp - damage);
    }
    
    if (window.isOnlineMode() && window.isHost()) {
        window.sendData({
            type: 'action_result',
            result: {
                attackerUniqueId: attacker.uniqueId,
                defenderUniqueId: defender.uniqueId,
                damage,
                newHp: defender.status.hp,
                critical,
                dodged,
                specialEffectLog
            }
        });
    }
}

function calculateDamage(attacker, defender, isMagic = false) {
    let actualDodgeRate = defender.status.dodgeRate;
    let specialEffectLog = '';

    if (attacker.originalId === 'char06' && attacker.targetMemory && attacker.targetMemory.lastTargetId === defender.uniqueId && attacker.targetMemory.missed) {
        actualDodgeRate /= 2;
        specialEffectLog += `${attacker.name}の「執着」が発動し、${defender.name}の回避率が半減した！`;
    }

    if (defender.effects.extinguishSpirit && defender.effects.extinguishSpirit.casterId === attacker.uniqueId) {
        actualDodgeRate *= 1.5;
        specialEffectLog += `${attacker.name}の「滅気」効果により、${defender.name}の回避率が上昇した！`;
    }

    const dodged = Math.random() < actualDodgeRate;
    let damage = 0;
    let critical = false;

    if (!dodged) {
        damage = isMagic
            ? Math.max(1, attacker.status.matk - Math.floor(defender.status.mdef / 2))
            : Math.max(1, attacker.status.atk - Math.floor(defender.status.def / 2));

        if (attacker.effects.abyssal_worship && defender.effects.abyssian_madness) {
            const damageBoost = attacker.effects.abyssal_worship.casterSupport;
            damage *= damageBoost;
            specialEffectLog += `${attacker.name}の「深淵の崇拝」が発動し、${damageBoost.toFixed(2)}倍のダメージを与えた！`;
        }

        critical = Math.random() < attacker.status.criticalRate;
        if (critical) {
            damage = Math.floor(damage * attacker.status.criticalMultiplier);
        }
    }

    if (attacker.originalId === 'char06') {
        attacker.targetMemory = { lastTargetId: defender.uniqueId, missed: dodged };
    }

    return { damage, critical, dodged, specialEffectLog };
}

// --- Target Selection ---

function selectTarget() {
    return new Promise(resolve => {
        const targets = (window.isOnlineMode() ? opponentParty : currentEnemies).filter(t => t.status.hp > 0);
        if (targets.length === 0) {
            resolve(null);
            return;
        }

        enemyPartyEl.classList.add('selecting');

        const handleTargetClick = (event) => {
            const targetEl = event.target.closest('.enemy-character');
            if (!targetEl) return;

            const targetUniqueId = targetEl.dataset.uniqueId;
            const target = targets.find(t => t.uniqueId === targetUniqueId);

            if (target) {
                enemyPartyEl.removeEventListener('click', handleTargetClick);
                enemyPartyEl.classList.remove('selecting');
                resolve({ target: target, party: window.isOnlineMode() ? opponentParty : currentEnemies });
            }
        };
        enemyPartyEl.addEventListener('click', handleTargetClick);
    });
}

// --- Skill Execution ---

async function executeSkill(player, skill) {
    switch (skill.name) {
        case 'ヒールライト':
            logMessage('回復する味方を選択してください。');
            const targetPlayer = await selectPlayerTarget();
            if (targetPlayer) {
                performHeal(player, targetPlayer);
                return true;
            }
            break;
        case '連撃':
            logMessage('攻撃する敵を選択してください。');
            const targetInfo = await selectTarget();
            if (targetInfo) {
                performMultiAttack(player, targetInfo.target);
                return true;
            }
            break;
        case 'なぎ払い':
        case 'ブリザード':
            const targets = window.isOnlineMode() ? opponentParty : currentEnemies;
            performAreaAttack(player, targets);
            return true;
        case '蠱惑の聖歌':
            performSanctuaryHymn(player);
            return true;
        case '深淵の理路':
            performAbyssalLogic(player);
            return true;
        case '血晶の零滴':
            logMessage('攻撃する敵を選択してください。');
            const dropTargetInfo = await selectTarget();
            if (dropTargetInfo) {
                performBloodCrystalDrop(player, dropTargetInfo.target);
                return true;
            }
            break;
        default:
            logMessage('このスキルはまだ実装されていません。');
            player.status.mp += skill.mp;
            break;
    }
    return false;
}

function selectPlayerTarget() {
    return new Promise(resolve => {
        const players = currentPlayerParty.filter(p => p.status.hp > 0);
        if (players.length === 0) {
            resolve(null);
            return;
        }

        playerPartyEl.classList.add('selecting');

        const handlePlayerClick = (event) => {
            const targetEl = event.target.closest('.player-character');
            if (!targetEl) return;

            const targetUniqueId = targetEl.dataset.uniqueId;
            const target = currentPlayerParty.find(p => p.uniqueId === targetUniqueId);

            if (target && target.status.hp > 0) {
                playerPartyEl.removeEventListener('click', handlePlayerClick);
                playerPartyEl.classList.remove('selecting');
                resolve(target);
            }
        };

        playerPartyEl.addEventListener('click', handlePlayerClick);
    });
}

// --- Skill Effects ---

function performHeal(healer, target) {
    const healAmount = healer.status.support * 2;
    logMessage(`${healer.name}は${target.name}を${healAmount}回復した。`, 'heal');
    target.status.hp = Math.min(target.status.maxHp, target.status.hp + healAmount);
    updatePlayerDisplay();
}

function performMultiAttack(attacker, target) {
    const attacks = 3;
    let totalDamage = 0;
    for (let i = 0; i < attacks; i++) {
        const { damage } = calculateDamage(attacker, target, attacker.attackType === 'magic');
        target.status.hp = Math.max(0, target.status.hp - damage);
        totalDamage += damage;
        if (target.status.hp <= 0) break;
    }
    updateEnemyDisplay();

    if (attacker.effects.curse && totalDamage > 0) {
        const curseDamage = Math.floor(attacker.status.maxHp * 0.05);
        attacker.status.hp = Math.max(0, attacker.status.hp - curseDamage);
        logMessage(`${attacker.name}は「呪縛」で${curseDamage}のダメージを受けた！`, 'damage');
    }
}

function performAreaAttack(attacker, targets) {
    if (targets) {
        targets.forEach(target => {
            if (target.status.hp > 0) {
                const { damage } = calculateDamage(attacker, target, attacker.attackType === 'magic');
                target.status.hp = Math.max(0, target.status.hp - damage);
            }
        });
        updateEnemyDisplay();
    }
}

function performSanctuaryHymn(caster) {
    const healAmount = Math.floor(caster.status.support * 0.5);
    if (currentPlayerParty) {
        currentPlayerParty.forEach(p => {
            p.status.hp = Math.min(p.status.maxHp, p.status.hp + healAmount);
            p.effects.abyssal_worship = { duration: 5, casterSupport: caster.status.support / 60 };
            logMessage(`${p.name}は「深淵の崇拝」の効果を得た！`, 'status-effect');
        });
        updatePlayerDisplay();
    }
}

function performAbyssalLogic(caster) {
    const targets = window.isOnlineMode() ? opponentParty : currentEnemies;
    if (targets) {
        targets.forEach(enemy => {
            if (enemy.effects.abyssal_echo) {
                logMessage(`${enemy.name}には「深淵の残響」が付与されているため、「深淵の狂気」を付与できません。`);
                return;
            }

            if (!enemy.effects.abyssian_madness) {
                enemy.effects.abyssian_madness = { stacks: 1, duration: 5 };
                logMessage(`${enemy.name}は「深淵の狂気」状態になった！`, 'status-effect');
            } else {
                enemy.effects.abyssian_madness.stacks++;
                enemy.effects.abyssian_madness.duration = 5;
                logMessage(`${enemy.name}の「深淵の狂気」スタックが${enemy.effects.abyssian_madness.stacks}になった。`, 'status-effect');
            }
        });
    }
}

function performBloodCrystalDrop(caster, target) {
    target.effects.blood_crystal_drop = { duration: 3, casterMatk: caster.status.matk, casterId: caster.uniqueId };
    logMessage(`${target.name}は「血晶の零滴」状態になった。`, 'status-effect');
}

// --- Status Effects ---

function processStatusEffects(combatant) {
    if (combatant.effects.abyssian_madness) {
        const madnessEffect = combatant.effects.abyssian_madness;
        const disableChance = 0.1 * madnessEffect.stacks;
        if (Math.random() < disableChance) {
            logMessage(`${combatant.name}は深淵の狂気に陥り、行動不能になった！`, 'status-effect');
            return true;
        }
    }

    if (combatant.originalId === 'char05' && currentPlayerParty && currentPlayerParty.includes(combatant)) {
        const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
        if (enemies) {
            enemies.forEach(enemy => {
                if (enemy.effects.abyssian_madness) {
                    if (Math.random() < 0.5) {
                        enemy.effects.abyssian_madness.stacks++;
                        logMessage(`零唯の「妖艶なる書架」が発動！${enemy.name}の狂気スタックが${enemy.effects.abyssian_madness.stacks}になった。`, 'special-event');
                    }
                }
            });
        }
    }

    return false;
}

function processEndTurnEffects(combatants) {
    combatants.forEach(combatant => {
        if (combatant.effects.blood_crystal_drop) {
            const dropEffect = combatant.effects.blood_crystal_drop;
            if (dropEffect.duration > 0) {
                const baseDamage = Math.floor(dropEffect.casterMatk * 0.3);
                const damage = Math.max(1, baseDamage - Math.floor(combatant.status.mdef / 2));
                combatant.status.hp = Math.max(0, combatant.status.hp - damage);
                logMessage(`${combatant.name}は「血晶の零滴」で${damage}のダメージを受けた！`, 'damage');

                if (currentPlayerParty) {
                    const caster = currentPlayerParty.find(p => p.uniqueId === dropEffect.casterId);
                    if (caster) {
                        const mpRecovery = Math.floor(damage * 0.5);
                        caster.status.mp = Math.min(caster.status.maxMp, caster.status.mp + mpRecovery);
                        updatePlayerDisplay();
                        logMessage(`${caster.name}はMPを${mpRecovery}回復した。`, 'heal');
                    }
                }
                dropEffect.duration--;
            } else {
                delete combatant.effects.blood_crystal_drop;
                logMessage(`${combatant.name}の「血晶の零滴」効果が切れた。`, 'status-effect');
            }
        }

        ['fadingBody', 'curse', 'extinguishSpirit', 'void'].forEach(effectName => {
            if (combatant.effects[effectName]) {
                combatant.effects[effectName].duration--;
                if (combatant.effects[effectName].duration <= 0) {
                    delete combatant.effects[effectName];
                    logMessage(`${combatant.name}の効果が切れた。`, 'status-effect');
                }
            }
        });
    });
}

// --- Battle End & State Management ---

function isBattleOver() {
    const playersAlive = currentPlayerParty.some(p => p.status.hp > 0);
    const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
    const enemiesAlive = enemies ? enemies.some(e => e.status.hp > 0) : false;
    return !playersAlive || !enemiesAlive;
}

function handleBattleEnd() {
    isBattleOngoing = false;
    const playersAlive = currentPlayerParty.some(p => p.status.hp > 0);

    if (window.isOnlineMode()) {
        logMessage(playersAlive ? '勝利しました！' : '敗北しました...');
        if (window.isHost()) {
            window.sendData({ type: 'battle_end', result: playersAlive ? 'win' : 'lose' });
        }
    } else {
        if (playersAlive) {
            logMessage('敵グループを撃破しました！');
            currentGroupIndex++;
            if (currentGroupIndex >= enemyGroups.length) {
                handleGameWin();
            } else {
                logMessage('次の戦闘へ進みます...');
                setTimeout(() => startNextGroup(), 3000);
            }
        } else {
            logMessage('全滅しました... ゲームオーバー');
            handleGameOver();
        }
    }
}

function handleGameWin() {
    logMessage('ゲームクリア！おめでとうございます！');
    setTimeout(resetToPartyScreen, 3000);
}

function handleGameOver() {
    setTimeout(resetToPartyScreen, 3000);
}

function resetToPartyScreen() {
    battleScreenEl.classList.add('hidden');
    partyScreen.classList.remove('hidden');
    goButton.disabled = false;
    myPartyReady = false;
    opponentPartyReady = false;
}

// --- Online Data Handling ---

function handleBattleAction(data) {
    switch (data.type) {
        case 'request_action':
            if (!window.isHost()) {
                const myCharacter = currentPlayerParty.find(p => p.uniqueId === data.actorUniqueId);
                if (myCharacter) {
                    playerTurn(myCharacter);
                }
            }
            break;
        case 'execute_action':
            if (window.isHost()) {
                executeAction(data);
                if (resolveActionPromise) {
                    resolveActionPromise();
                }
            }
            break;
        case 'action_result':
             if (!window.isHost()) {
                const { attackerUniqueId, defenderUniqueId, damage, newHp, critical, dodged, specialEffectLog } = data.result;
                const allCombatants = [...currentPlayerParty, ...opponentParty];
                const attacker = allCombatants.find(c => c.uniqueId === attackerUniqueId);
                const defender = allCombatants.find(c => c.uniqueId === defenderUniqueId);

                if (!attacker || !defender) return;

                if (specialEffectLog) logMessage(specialEffectLog, 'status-effect');
                if (dodged) {
                    logMessage(`${defender.name}は攻撃を回避した！`, 'status-effect');
                } else {
                    if (critical) logMessage(`会心の一撃！`, 'special-event');
                    logMessage(`${attacker.name}の攻撃！ ${defender.name}に${damage}のダメージ！`, 'damage');
                    defender.status.hp = newHp;
                }
                updatePlayerDisplay();
                updateEnemyDisplay();
            }
            break;
        case 'sync_game_state':
            if (!window.isHost()) {
                currentPlayerParty = data.playerParty;
                opponentParty = data.opponentParty;
                currentTurn = data.currentTurn;
                updatePlayerDisplay();
                updateEnemyDisplay();
            }
            break;
        case 'log_message':
            logMessage(data.message, data.messageType);
            break;
        case 'battle_end':
            isBattleOngoing = false;
            logMessage(data.result === 'win' ? '勝利しました！' : '敗北しました...');
            handleGameOver();
            break;
    }
}

function syncGameState() {
    if (window.isOnlineMode() && window.isHost()) {
        window.sendData({
            type: 'sync_game_state',
            playerParty: opponentParty,
            opponentParty: currentPlayerParty,
            currentTurn: currentTurn
        });
    }
}

// --- UI Rendering ---

function renderParty(partyEl, partyData, isEnemy) {
    partyEl.innerHTML = "";
    if (!partyData) return;

    partyData.forEach(member => {
        const memberEl = document.createElement("div");
        memberEl.classList.add("character-card", isEnemy ? "enemy-character" : "player-character");
        
        // ユニークIDをdata属性に設定
        if (isEnemy) {
            memberEl.dataset.uniqueId = member.uniqueId;
            memberEl.dataset.enemyId = member.originalId; // 後方互換性のため
        } else {
            memberEl.dataset.uniqueId = member.uniqueId;
            memberEl.dataset.charId = member.originalId; // 後方互換性のため
        }

        const hpBar = `<div class="hp-bar"><div class="hp-bar-fill" style="width: ${(member.status.hp / member.status.maxHp) * 100}%;"></div></div>`;
        const mpBar = isEnemy ? '' : `<div class="mp-bar"><div class="mp-bar-fill" style="width: ${(member.status.mp / member.status.maxMp) * 100}%;"></div></div>`;
        const mpText = isEnemy ? '' : `<p>MP: <span class="mp-text">${member.status.mp}/${member.status.maxMp}</span></p>`;

        memberEl.innerHTML = `
            <h3>${member.name}</h3>
            <p>HP: <span class="hp-text">${member.status.hp}/${member.status.maxHp}</span></p>
            ${hpBar}
            ${mpText}
            ${mpBar}
        `;
        partyEl.appendChild(memberEl);
    });
}

function renderBattle() {
    const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
    renderParty(playerPartyEl, currentPlayerParty, false);
    renderParty(enemyPartyEl, enemies, true);
    commandAreaEl.innerHTML = createCommandMenu();
    commandAreaEl.classList.add('hidden');
}

function createCommandMenu() {
    return `
        <div class="commands">
            <button class="command-button action-attack">こうげき</button>
            <button class="command-button action-skill">とくぎ</button>
            <div class="skill-menu hidden"></div>
            <button class="command-button action-special hidden">ひっさつ</button>
            <button class="command-button action-defend">ぼうぎょ</button>
        </div>
    `;
}

function updateCommandMenu(player) {
    if (!player) return;

    const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
    const specialButtonEl = commandAreaEl.querySelector('.action-special');

    if (skillMenuEl) {
        skillMenuEl.innerHTML = player.active.map(skill => {
            return `<button class="skill-button">${skill.name}</button>`;
        }).join('');
    }

    if (player.originalId === 'char06') {
        const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
        player.special.condition = (p) => {
            return enemies && enemies.some(e => Object.keys(e.effects || {}).length >= 2);
        };
    }

    if (specialButtonEl && player.special.condition && player.special.condition(player)) {
        specialButtonEl.classList.remove('hidden');
    } else if (specialButtonEl) {
        specialButtonEl.classList.add('hidden');
    }
}

// --- Global Exports ---
window.startBattle = startBattle;
window.handleOpponentParty = handleOpponentParty;
window.startBattleClientSide = startBattleClientSide;
window.handleBattleAction = handleBattleAction;
