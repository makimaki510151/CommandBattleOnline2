// battle.js

import { enemyData, enemyGroups } from './enemies.js';
import { passiveAbilities, endTurnPassiveAbilities, specialAbilityConditions, skillEffects, damagePassiveEffects, criticalPassiveEffects } from './character_abilities.js';

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

        // キャラクター固有の初期化
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

    currentPlayerParty = initializeParty(partyMembers, 'player');
    currentGroupIndex = 0;

    await startNextGroup();
}

// オンライン対戦用の開始関数を新しく定義
window.startOnlineBattle = function () {
    logMessage('オンライン対戦を開始します！');
    if (isBattleOngoing) return;

    isBattleOngoing = true;
    currentTurn = 0;

    // パーティー画面で選択されたパーティーを取得
    const myParty = window.getSelectedParty();
    if (!myParty || !opponentParty) {
        console.error('パーティーデータが不完全です。');
        return;
    }

    // 自分のパーティーと相手のパーティーを初期化
    currentPlayerParty = initializeParty(myParty, window.isHost() ? 'host' : 'client');
    opponentParty = initializeParty(opponentParty, window.isHost() ? 'client' : 'host');

    renderBattle();

    // ホストのみがバトルループを開始
    if (window.isHost()) {
        battleLoop();
    } else {
        logMessage("ホストの処理を待っています...");
    }
};

window.handleOpponentParty = function (partyData) {
    if (!partyData) {
        console.error('Received empty party data.');
        return;
    }
    opponentParty = partyData.map((p, index) => {
        const member = deepCopy(p);
        if (!member.uniqueId) {
            member.uniqueId = generateUniqueId();
        }
        member.originalId = member.id || member.originalId;
        member.partyType = window.isHost() ? 'client' : 'host';
        member.partyIndex = index;
        member.effects = member.effects || {};
        return member;
    });
    logMessage('相手のパーティー情報を受信しました！');
};

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

        // パッシブ能力の適用（ターン開始時）
        applyPassiveAbilities(aliveCombatants);

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

            const isMyCharacter = combatant.partyType === (window.isHost() ? 'host' : 'client');

            if (isMyCharacter) {
                // プレイヤーのターンでは playerTurn 関数内でハイライトを管理
                await playerTurn(combatant);
            } else {
                // 敵や相手のキャラクターのターン
                resetHighlights();
                const combatantEl = document.querySelector(`[data-unique-id="${combatant.uniqueId}"]`);
                if (combatantEl) {
                    combatantEl.classList.add('active');
                }

                if (window.isOnlineMode()) {
                    window.sendData({ type: 'request_action', actorUniqueId: combatant.uniqueId });
                    logMessage(`${combatant.name}の行動を待っています...`);
                    await waitForAction();
                } else {
                    await enemyTurn(combatant);
                }
            }

            if (window.isOnlineMode()) {
                syncGameState();
            } else {
                resetHighlights(); // シングルプレイではターンの最後にハイライトをリセット
            }
        }

        // ターン終了時の効果処理
        processEndTurnEffects(aliveCombatants);
        applyEndTurnPassiveAbilities(aliveCombatants);

        // ターン終了後に再度勝敗判定（自己修復などで状況が変わる可能性があるため）
        if (isBattleOver()) {
            handleBattleEnd();
            break;
        }

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

// --- Passive Abilities ---

function applyPassiveAbilities(combatants) {
    const playerCombatants = combatants.filter(c => c.partyType !== 'enemy');
    const enemyCombatants = combatants.filter(c => c.partyType === 'enemy');

    combatants.forEach(combatant => {
        const passiveFunc = passiveAbilities[combatant.originalId];
        if (passiveFunc) {
            const allies = combatant.partyType === 'enemy' ? enemyCombatants : playerCombatants;
            const enemies = combatant.partyType === 'enemy' ? playerCombatants : enemyCombatants;
            passiveFunc(combatant, allies, enemies);
        }
    });
}

function applyEndTurnPassiveAbilities(combatants) {
    combatants.forEach(combatant => {
        // 生存しているキャラクターのみにターン終了時パッシブを適用
        if (combatant.status.hp > 0) {
            const endTurnPassiveFunc = endTurnPassiveAbilities[combatant.originalId];
            if (endTurnPassiveFunc) {
                const message = endTurnPassiveFunc(combatant);
                if (message) {
                    logMessage(message, 'heal');
                }
            }
        }
    });
}

// --- Turn Handling ---

async function playerTurn(player) {
    // プレイヤーのターン開始時に全てのハイライトをリセット
    resetHighlights();

    // 行動中のキャラクターをハイライト
    const playerEl = document.querySelector(`[data-unique-id="${player.uniqueId}"]`);
    if (playerEl) {
        playerEl.classList.add('active');
    }

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

                    // 状態異常によるMP消費増加の処理
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
            } else if (target.matches('.action-special')) {
                const special = player.special;
                if (special) {
                    let mpCost = special.mp;

                    if (player.status.mp < mpCost) {
                        logMessage(`MPが足りません！`);
                        return;
                    }

                    player.status.mp -= mpCost;
                    logMessage(`${player.name}は${special.name}を使った！`);

                    const specialExecuted = await executeSpecial(player, special);
                    if (specialExecuted) {
                        actionData = {
                            action: 'special',
                            actorUniqueId: player.uniqueId,
                            specialName: special.name
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
        case 'special':
            logMessage(`${actor.name}は${data.specialName}を使った！`);
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

function calculateDamage(attacker, defender, isMagic = false, multiplier = 1.0) {
    // 攻撃タイプの自動判定
    if (attacker.attackType === 'magic') {
        isMagic = true;
    } else if (attacker.attackType === 'hybrid') {
        // ハイブリッドタイプの場合、攻撃力と魔法攻撃力の高い方を使用
        isMagic = attacker.status.matk > attacker.status.atk;
    }

    let actualDodgeRate = defender.status.dodgeRate;
    let actualCriticalRate = attacker.status.criticalRate;
    let specialEffectLog = '';

    // 状態異常による回避率の変更
    if (defender.effects.dodgeDebuff) {
        actualDodgeRate *= defender.effects.dodgeDebuff.value;
    }
    if (defender.effects.accuracyDebuff) {
        actualDodgeRate *= (2 - defender.effects.accuracyDebuff.value); // 命中率低下は回避率上昇として扱う
    }

    // パッシブ能力によるクリティカル率の変更
    const criticalPassiveFunc = criticalPassiveEffects[attacker.originalId];
    if (criticalPassiveFunc) {
        actualCriticalRate = criticalPassiveFunc(attacker, defender, actualCriticalRate);
    }

    // 防御状態の処理
    if (defender.isDefending) {
        actualDodgeRate *= 1.5; // 防御時は回避率1.5倍
        defender.isDefending = false; // 防御状態をリセット
    }

    const dodged = Math.random() < actualDodgeRate;
    let damage = 0;
    let critical = false;

    if (!dodged) {
        // 基本ダメージ計算
        const attackPower = isMagic ? attacker.status.matk : attacker.status.atk;
        const defense = isMagic ? defender.status.mdef : defender.status.def;

        // バフ・デバフの適用
        let finalAttackPower = attackPower;
        let finalDefense = defense;

        if (attacker.effects.atkBuff) {
            finalAttackPower *= attacker.effects.atkBuff.value;
        }
        if (attacker.effects.atkDebuff) {
            finalAttackPower *= attacker.effects.atkDebuff.value;
        }

        if (defender.effects.defBuff) {
            finalDefense *= defender.effects.defBuff.value;
        }
        if (defender.effects.defDebuff) {
            finalDefense *= defender.effects.defDebuff.value;
        }
        if (defender.effects.mdefBuff && isMagic) {
            finalDefense *= defender.effects.mdefBuff.value;
        }

        damage = Math.max(1, Math.floor(finalAttackPower * multiplier) - Math.floor(finalDefense / 2));

        // パッシブ能力によるダメージ修正
        const damagePassiveFunc = damagePassiveEffects[attacker.originalId];
        if (damagePassiveFunc) {
            damage = damagePassiveFunc(attacker, defender, damage, !isMagic);
        }

        // クリティカル判定
        critical = Math.random() < actualCriticalRate;
        if (critical) {
            damage = Math.floor(damage * attacker.status.criticalMultiplier);
        }
    }

    // キャラクター固有の記憶処理（ゼノス）
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

        // ターゲットにハイライトを適用
        targets.forEach(target => {
            const targetEl = document.querySelector(`[data-unique-id="${target.uniqueId}"]`);
            if (targetEl) {
                targetEl.classList.add('selecting-target');
            }
        });

        const handleTargetClick = (event) => {
            const targetEl = event.target.closest('.enemy-character');
            if (!targetEl) return;
            const targetUniqueId = targetEl.dataset.uniqueId;
            const target = targets.find(t => t.uniqueId === targetUniqueId);
            if (target) {
                document.removeEventListener('click', handleTargetClick);
                resetHighlights(); // ハイライトをリセット
                resolve({ target: target, party: window.isOnlineMode() ? opponentParty : currentEnemies });
            }
        };
        document.addEventListener('click', handleTargetClick);
    });
}

function selectPlayerTarget() {
    return new Promise(resolve => {
        const players = currentPlayerParty.filter(p => p.status.hp > 0);
        if (players.length === 0) {
            resolve(null);
            return;
        }

        // ターゲットにハイライトを適用
        players.forEach(player => {
            const playerEl = document.querySelector(`[data-unique-id="${player.uniqueId}"]`);
            if (playerEl) {
                playerEl.classList.add('selecting-target');
            }
        });

        const handlePlayerClick = (event) => {
            const targetEl = event.target.closest('.player-character');
            if (!targetEl) return;
            const targetUniqueId = targetEl.dataset.uniqueId;
            const target = currentPlayerParty.find(p => p.uniqueId === targetUniqueId);
            if (target && target.status.hp > 0) {
                document.removeEventListener('click', handlePlayerClick);
                resetHighlights(); // ハイライトをリセット
                resolve(target);
            }
        };
        document.addEventListener('click', handlePlayerClick);
    });
}

// --- Skill Execution ---

async function executeSkill(player, skill) {
    const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
    const aliveEnemies = (window.isOnlineMode() ? opponentParty : currentEnemies).filter(e => e.status.hp > 0);

    let targets = [];

    // スキルの対象を決定
    const healingSkills = ['ガイアヒーリング', 'メディックウェーブ', 'リフレッシュ'];
    const supportSkills = ['プロテクション'];
    const enemyAllSkills = ['イリュージョンスモーク', 'アローレイン', 'フロストスプライト', 'カオスブレイク', 'グラビティフィールド'];
    const allyAllSkills = ['メディックウェーブ'];

    if (healingSkills.includes(skill.name) || supportSkills.includes(skill.name)) {
        if (allyAllSkills.includes(skill.name)) {
            targets = alivePlayers;
        } else {
            logMessage('味方を選択してください。');
            const playerTarget = await selectPlayerTarget();
            if (playerTarget) {
                targets = [playerTarget];
            } else {
                return false;
            }
        }
    } else if (enemyAllSkills.includes(skill.name)) {
        targets = aliveEnemies;
    } else {
        logMessage('敵を選択してください。');
        const enemyTargetInfo = await selectTarget();
        if (enemyTargetInfo) {
            targets = [enemyTargetInfo.target];
        } else {
            return false;
        }
    }

    const skillFunc = skillEffects[skill.name];
    if (skillFunc) {
        skillFunc(player, targets, calculateDamage, logMessage);
        return true;
    }

    logMessage('このスキルはまだ実装されていません。');
    player.status.mp += skill.mp; // 消費したMPを戻す
    return false;
}

async function executeSpecial(player, special) {
    const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
    const aliveEnemies = (window.isOnlineMode() ? opponentParty : currentEnemies).filter(e => e.status.hp > 0);
    const deadPlayers = currentPlayerParty.filter(p => p.status.hp <= 0);

    let targets = [];

    // 必殺技の対象を決定
    const enemyAllSpecials = ['ホーリーランス', 'シャドウバースト', 'アストラルゲート'];
    const selfBuffSpecials = ['オーバードライブ'];
    const reviveSpecials = ['天国の扉'];

    if (enemyAllSpecials.includes(special.name)) {
        targets = aliveEnemies;
    } else if (selfBuffSpecials.includes(special.name)) {
        targets = [player];
    } else if (reviveSpecials.includes(special.name)) {
        targets = deadPlayers;
    } else {
        logMessage('敵を選択してください。');
        const enemyTargetInfo = await selectTarget();
        if (enemyTargetInfo) {
            targets = [enemyTargetInfo.target];
        } else {
            return false;
        }
    }

    const specialFunc = skillEffects[special.name];
    if (specialFunc) {
        specialFunc(player, targets, calculateDamage, logMessage);
        return true;
    }

    logMessage('この必殺技はまだ実装されていません。');
    player.status.mp += special.mp; // 消費したMPを戻す
    return false;
}

// --- Status Effects ---

function processStatusEffects(combatant) {
    // スタン状態のチェック
    if (combatant.effects.stun) {
        logMessage(`${combatant.name}はスタン状態で行動できない！`, 'status-effect');
        combatant.effects.stun.duration--;
        if (combatant.effects.stun.duration <= 0) {
            delete combatant.effects.stun;
            logMessage(`${combatant.name}のスタン状態が回復した。`, 'status-effect');
        }
        return true;
    }

    // 凍結状態のチェック
    if (combatant.effects.freeze) {
        logMessage(`${combatant.name}は凍結状態で行動できない！`, 'status-effect');
        combatant.effects.freeze.duration--;
        if (combatant.effects.freeze.duration <= 0) {
            delete combatant.effects.freeze;
            logMessage(`${combatant.name}の凍結状態が回復した。`, 'status-effect');
        }
        return true;
    }

    // 混乱状態のチェック
    if (combatant.effects.confusion) {
        if (Math.random() < 0.5) {
            logMessage(`${combatant.name}は混乱して行動できない！`, 'status-effect');
            combatant.effects.confusion.duration--;
            if (combatant.effects.confusion.duration <= 0) {
                delete combatant.effects.confusion;
                logMessage(`${combatant.name}の混乱状態が回復した。`, 'status-effect');
            }
            return true;
        }
    }

    // 沈黙状態のチェック（魔法使用不可）
    if (combatant.effects.silence) {
        combatant.effects.silence.duration--;
        if (combatant.effects.silence.duration <= 0) {
            delete combatant.effects.silence;
            logMessage(`${combatant.name}の沈黙状態が回復した。`, 'status-effect');
        }
    }

    return false;
}

function processEndTurnEffects(combatants) {
    combatants.forEach(combatant => {
        // 毒ダメージ
        if (combatant.effects.poison) {
            const poisonDamage = combatant.effects.poison.damage;
            combatant.status.hp = Math.max(0, combatant.status.hp - poisonDamage);
            logMessage(`${combatant.name}は毒で${poisonDamage}のダメージを受けた！`, 'damage');
            combatant.effects.poison.duration--;
            if (combatant.effects.poison.duration <= 0) {
                delete combatant.effects.poison;
                logMessage(`${combatant.name}の毒状態が回復した。`, 'status-effect');
            }
        }

        // 出血ダメージ
        if (combatant.effects.bleed) {
            const bleedDamage = combatant.effects.bleed.damage;
            combatant.status.hp = Math.max(0, combatant.status.hp - bleedDamage);
            logMessage(`${combatant.name}は出血で${bleedDamage}のダメージを受けた！`, 'damage');
            combatant.effects.bleed.duration--;
            if (combatant.effects.bleed.duration <= 0) {
                delete combatant.effects.bleed;
                logMessage(`${combatant.name}の出血状態が回復した。`, 'status-effect');
            }
        }

        // バフ・デバフの持続時間減少
        const effects = ['atkBuff', 'defBuff', 'mdefBuff', 'spdBuff', 'atkDebuff', 'defDebuff', 'spdDebuff', 'dodgeDebuff', 'accuracyDebuff'];
        effects.forEach(effectName => {
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

    // デバッグ用ログ
    console.log('Battle status check:', {
        playersAlive,
        enemiesAlive,
        playerParty: currentPlayerParty.map(p => ({ name: p.name, hp: p.status.hp })),
        enemies: enemies ? enemies.map(e => ({ name: e.name, hp: e.status.hp })) : []
    });

    return !playersAlive || !enemiesAlive;
}

function handleBattleEnd() {
    console.log('handleBattleEnd called');
    isBattleOngoing = false;
    const playersAlive = currentPlayerParty.some(p => p.status.hp > 0);

    if (window.isOnlineMode()) {
        const isWinner = playersAlive;
        console.log('Online battle end:', { isWinner, playersAlive });
        logMessage(isWinner ? '勝利しました！' : '敗北しました...');

        if (window.isHost()) {
            console.log('Host sending battle_end message');
            window.sendData({ type: 'battle_end', result: isWinner ? 'win' : 'lose' });
        }

        // 勝利・敗北演出を表示
        console.log('Showing battle result');
        showBattleResult(isWinner);
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

function showBattleResult(isWinner) {
    console.log('showBattleResult called with isWinner:', isWinner);

    // 既存の結果画面があれば削除
    const existingResult = document.getElementById('battle-result-overlay');
    if (existingResult) {
        console.log('Removing existing result overlay');
        existingResult.remove();
    }

    // 結果画面のオーバーレイを作成
    const overlay = document.createElement('div');
    overlay.id = 'battle-result-overlay';
    overlay.className = 'battle-result-overlay';

    const resultContainer = document.createElement('div');
    resultContainer.className = 'battle-result-container';

    const resultTitle = document.createElement('h1');
    resultTitle.className = 'battle-result-title';
    resultTitle.textContent = isWinner ? '勝利！' : '敗北...';

    const resultMessage = document.createElement('p');
    resultMessage.className = 'battle-result-message';
    resultMessage.textContent = isWinner ?
        'おめでとうございます！見事勝利を収めました！' :
        '残念ながら敗北してしまいました...';

    const returnButton = document.createElement('button');
    returnButton.className = 'battle-result-button';
    returnButton.textContent = 'タイトルに戻る';
    returnButton.addEventListener('click', () => {
        overlay.remove();
        returnToTitle();
    });

    resultContainer.appendChild(resultTitle);
    resultContainer.appendChild(resultMessage);
    resultContainer.appendChild(returnButton);
    overlay.appendChild(resultContainer);

    // バトル画面に追加
    battleScreenEl.appendChild(overlay);

    // アニメーション効果
    setTimeout(() => {
        overlay.classList.add('show');
    }, 100);

    // 5秒後に自動でタイトルに戻る
    setTimeout(() => {
        if (document.getElementById('battle-result-overlay')) {
            overlay.remove();
            returnToTitle();
        }
    }, 5000);
}

function returnToTitle() {
    // 画面を切り替え
    battleScreenEl.classList.add('hidden');

    // オンラインモードの場合はオンライン画面に戻る
    if (window.isOnlineMode()) {
        const onlineScreen = document.getElementById('online-screen');
        const titleScreen = document.getElementById('title-screen');

        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');

        // 接続をクリーンアップ
        if (window.peer) {
            window.peer.destroy();
        }
    } else {
        const titleScreen = document.getElementById('title-screen');
        titleScreen.classList.remove('hidden');
    }

    // 状態をリセット
    goButton.disabled = false;
    myPartyReady = false;
    opponentPartyReady = false;
    isBattleOngoing = false;
    currentTurn = 0;

    // メッセージログをクリア
    messageLogEl.innerHTML = '';
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
            const isWinner = data.result === 'lose'; // ホストの結果と逆になる
            logMessage(isWinner ? '勝利しました！' : '敗北しました...');
            showBattleResult(isWinner);
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

        const characterImage = member.image ? `<img src="${member.image}" alt="${member.name}" class="character-image">` : '';
        const hpBar = `<div class="hp-bar"><div class="hp-bar-fill" style="width: ${(member.status.hp / member.status.maxHp) * 100}%;"></div></div>`;
        const mpBar = isEnemy ? '' : `<div class="mp-bar"><div class="mp-bar-fill" style="width: ${(member.status.mp / member.status.maxMp) * 100}%;"></div></div>`;
        const mpText = isEnemy ? '' : `<p class="mp-text-line">MP: <span class="mp-text">${member.status.mp}/${member.status.maxMp}</span></p>`;

        memberEl.innerHTML = `
            <div class="character-info">
                ${characterImage}
                <div class="character-details">
                    <h3 class="character-name">${member.name}</h3>
                    <p class="hp-text-line">HP: <span class="hp-text">${member.status.hp}/${member.status.maxHp}</span></p>
                    ${hpBar}
                    ${mpText}
                    ${mpBar}
                </div>
            </div>
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

    const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
    const allies = currentPlayerParty.filter(p => p.status.hp > 0);
    const specialConditionFunc = specialAbilityConditions[player.originalId];

    if (specialButtonEl && specialConditionFunc && specialConditionFunc(player, allies)) {
        specialButtonEl.classList.remove('hidden');
    } else if (specialButtonEl) {
        specialButtonEl.classList.add('hidden');
    }
}

function resetHighlights() {
    document.querySelectorAll('.player-character.active, .player-character.selecting-target, .enemy-character.selecting-target').forEach(el => {
        el.classList.remove('active', 'selecting-target');
    });
}

// --- Global Exports ---
window.startBattle = startBattle;
window.handleOpponentParty = handleOpponentParty;
window.startBattleClientSide = startBattleClientSide;
window.handleBattleAction = handleBattleAction;
