// battle.js (通信技術を新に、その他を旧に)

import { enemyData, enemyGroups } from './enemies.js';
import { passiveAbilities, endTurnPassiveAbilities, specialAbilityConditions, skillEffects, damagePassiveEffects, criticalPassiveEffects } from './character_abilities.js';

// DOM Elements
const enemyPartyEl = document.getElementById('enemy-party');
const playerPartyEl = document.getElementById('player-party');
const messageLogEl = document.getElementById('message-log');
const commandAreaEl = document.getElementById('command-area');
const battleScreenEl = document.getElementById('battle-screen');
const partyScreen = document.getElementById('party-screen');

// Game State
let currentPlayerParty = null;     // 自分のパーティー情報
let opponentParty = null;          // 相手のパーティー情報 (オンライン対戦時)
let currentEnemies = null;         // シングルプレイ時の敵情報
let currentTurn = 0;
let isBattleOngoing = false;
let currentGroupIndex = 0;

// オンライン対戦用の準備完了フラグ
let myPartyReady = false;
let opponentPartyReady = false;

// ユニークID生成カウンター
let uniqueIdCounter = 0;

// オンライン対戦用の行動待機
let resolveActionPromise = null;

// --- Utility Functions ---

function generateUniqueId() {
    return `unique_${Date.now()}_${uniqueIdCounter++}`;
}

function logMessage(message, type = '') {
    // main.jsのグローバル関数を優先的に使用
    if (window.logMessage) {
        window.logMessage(message, type);
    } else {
        const p = document.createElement('p');
        p.textContent = message;
        if (type) {
            p.classList.add('log-message', type);
        }
        messageLogEl.appendChild(p);
        messageLogEl.scrollTop = messageLogEl.scrollHeight;
    }
}

function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function getRandomTarget(targets) {
    if (targets.length === 0) return null;
    return targets[Math.floor(Math.random() * targets.length)];
}

// --- Display Update Functions ---

function createCharacterElement(character, isEnemy) {
    const el = document.createElement('div');
    el.className = `character-card ${isEnemy ? 'enemy-character' : 'player-character'}`;
    el.dataset.uniqueId = character.uniqueId;

    const statusHtml = `
        <div class="character-info">
            <h3 class="name">${character.name}</h3>
            <p class="level">Lv.${character.status.level}</p>
        </div>
        <div class="character-stats">
            <div class="hp-bar">
                <div class="hp-bar-fill"></div>
            </div>
            <p class="hp-text">${character.status.hp}/${character.status.maxHp}</p>
            <div class="mp-bar">
                <div class="mp-bar-fill"></div>
            </div>
            <p class="mp-text">${character.status.mp}/${character.status.maxMp}</p>
        </div>
    `;
    el.innerHTML = statusHtml;
    return el;
}

function renderParty(partyEl, partyData, isEnemy) {
    if (!partyData) return;

    partyEl.innerHTML = ''; // 一度クリア
    partyData.forEach(member => {
        const memberEl = createCharacterElement(member, isEnemy);
        partyEl.appendChild(memberEl);
    });
}

function renderBattle() {
    if (!window.isOnlineMode()) {
        renderParty(playerPartyEl, currentPlayerParty, false);
        renderParty(enemyPartyEl, currentEnemies, true);
    } else {
        renderParty(playerPartyEl, currentPlayerParty, false);
        renderParty(enemyPartyEl, opponentParty, true);
    }
    updateAllDisplays();
    commandAreaEl.innerHTML = '';
    commandAreaEl.classList.add('hidden');
}

function updatePartyDisplay(partyEl, partyData) {
    if (!partyData) return;
    partyData.forEach((member) => {
        const memberEl = partyEl.querySelector(`[data-unique-id="${member.uniqueId}"]`);
        if (!memberEl) return;

        const hpFill = memberEl.querySelector('.hp-bar-fill');
        const hpText = memberEl.querySelector('.hp-text');
        const mpFill = memberEl.querySelector('.mp-bar-fill');
        const mpText = memberEl.querySelector('.mp-text');

        const hpPercentage = (member.status.hp / member.status.maxHp) * 100;
        if (hpFill) hpFill.style.width = `${hpPercentage}%`;
        if (hpText) hpText.textContent = `${member.status.hp}/${member.status.maxHp}`;

        if (mpFill && member.status.maxMp > 0) {
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

function updateAllDisplays() {
    updatePartyDisplay(playerPartyEl, currentPlayerParty);
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

// シングルプレイ用バトル開始
async function startBattle(partyMembers) {
    logMessage('戦闘開始！');
    isBattleOngoing = true;
    currentTurn = 0;

    currentPlayerParty = initializeParty(partyMembers, 'player');

    currentGroupIndex = 0;
    await startNextGroup();
}

// オンライン対戦用：自分のパーティーを準備
function initializePlayerParty(partyData) {
    currentPlayerParty = initializeParty(partyData, window.isHost() ? 'host' : 'client');
    renderParty(playerPartyEl, currentPlayerParty, false);

    enemyPartyEl.innerHTML = '<p class="waiting-message">相手の準備を待っています...</p>';

    myPartyReady = true;
    logMessage('自分のパーティーの準備が完了しました。');
}

// オンライン対戦用：相手のパーティー情報を受け取る
function handleOpponentParty(partyData) {
    if (!partyData || !Array.isArray(partyData)) {
        console.error('受信した相手のパーティーデータが無効です。', partyData);
        logMessage('エラー: 相手のパーティー情報の受信に失敗しました。', 'error');
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
        if (member.originalId === 'char06') {
            member.targetMemory = member.targetMemory || { lastTargetId: null, missed: false };
        }
        return member;
    });
    
    logMessage('相手のパーティー情報を受信しました！');
    renderParty(enemyPartyEl, opponentParty, true);
    
    opponentPartyReady = true;
    checkBothPartiesReady();
}

// 両方のパーティーが準備完了かチェックし、戦闘を開始
function checkBothPartiesReady() {
    if (myPartyReady && opponentPartyReady) {
        logMessage('両者の準備が完了しました。');
        if (window.isHost()) {
            logMessage('ホストとして戦闘を開始します。');
            window.sendData({ type: 'start_battle' });
            startOnlineBattle();
        } else {
            logMessage('ホストからの戦闘開始を待っています...');
        }
    }
}

// オンライン対戦用バトル開始
async function startOnlineBattle() {
    if (isBattleOngoing) return;
    logMessage('オンライン対戦を開始します！');
    isBattleOngoing = true;
    currentTurn = 0;
    renderBattle();
    await battleLoop();
}

function startBattleClientSide() {
    // 新版では `checkBothPartiesReady` と `startOnlineBattle` がこの役割を担う
    console.log("startBattleClientSideは新版では使用されません。");
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
                await playerTurn(combatant);
            } else {
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
                resetHighlights();
            }
        }
        processEndTurnEffects(aliveCombatants);
        applyEndTurnPassiveAbilities(aliveCombatants);
        if (isBattleOver()) {
            handleBattleEnd();
            break;
        }
        currentTurn++;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// オンライン同期用のアクションハンドラ
window.handleBattleAction = (data) => {
    switch (data.type) {
        case 'party_data':
            handleOpponentParty(data.party);
            break;
        case 'start_battle':
            startOnlineBattle();
            break;
        case 'request_action':
            if (resolveActionPromise && !window.isHost()) {
                executeEnemyAction(data);
                resolveActionPromise();
            }
            break;
        case 'execute_action':
            if (resolveActionPromise) {
                executeOnlineAction(data);
                resolveActionPromise();
            }
            break;
        case 'action_result':
            logMessage(data.message);
            updateAllDisplays();
            break;
        case 'sync_game_state':
            currentPlayerParty = data.playerParty;
            opponentParty = data.opponentParty;
            currentTurn = data.currentTurn;
            isBattleOngoing = data.isBattleOngoing;
            updateAllDisplays();
            logMessage('ゲーム状態を同期しました。');
            if (!isBattleOngoing && resolveActionPromise) {
                resolveActionPromise();
            }
            break;
        case 'log_message':
            logMessage(data.message, data.messageType);
            break;
        case 'battle_end':
            handleBattleEnd();
            break;
        default:
            console.log('Unknown data type received:', data.type);
            break;
    }
};

function waitForAction() {
    return new Promise(resolve => {
        resolveActionPromise = resolve;
    });
}

function syncGameState() {
    if (window.isOnlineMode() && window.isHost()) {
        window.sendData({
            type: 'sync_game_state',
            playerParty: currentPlayerParty,
            opponentParty: opponentParty,
            currentTurn: currentTurn,
            isBattleOngoing: isBattleOngoing
        });
    }
}

function handleBattleEnd() {
    isBattleOngoing = false;
    if (window.isOnlineMode()) {
        const myPartyAlive = currentPlayerParty.some(c => c.status.hp > 0);
        const opponentPartyAlive = opponentParty.some(c => c.status.hp > 0);
        
        if (myPartyAlive) {
            logMessage('あなたの勝利です！', 'win');
        } else if (opponentPartyAlive) {
            logMessage('あなたの敗北です。', 'lose');
        } else {
            logMessage('引き分けです。', 'draw');
        }
        window.sendData({ type: 'battle_end', result: myPartyAlive ? 'win' : opponentPartyAlive ? 'lose' : 'draw' });
        window.cleanupSkyWay(); // 戦闘終了時に通信をクリーンアップ
    } else {
        if (currentPlayerParty.some(c => c.status.hp > 0) && currentEnemies.every(e => e.status.hp <= 0)) {
            logMessage('勝利！', 'win');
            currentGroupIndex++;
            document.getElementById('go-button').textContent = `次のグループへ (${currentGroupIndex + 1}/${enemyGroups.length})`;
            setTimeout(() => {
                battleScreenEl.classList.add('hidden');
                partyScreen.classList.remove('hidden');
            }, 3000);
        } else {
            logMessage('敗北...', 'lose');
            setTimeout(() => {
                location.reload();
            }, 3000);
        }
    }
}

function isBattleOver() {
    if (window.isOnlineMode()) {
        const myPartyAlive = currentPlayerParty.some(c => c.status.hp > 0);
        const opponentPartyAlive = opponentParty.some(c => c.status.hp > 0);
        return !myPartyAlive || !opponentPartyAlive;
    } else {
        const playersAlive = currentPlayerParty.some(c => c.status.hp > 0);
        const enemiesDefeated = currentEnemies.every(e => e.status.hp <= 0);
        return !playersAlive || enemiesDefeated;
    }
}

// --- Player & Enemy Actions ---

async function playerTurn(player) {
    return new Promise(async (resolve) => {
        logMessage(`${player.name}のターン！`);
        resetHighlights();
        const playerEl = document.querySelector(`[data-unique-id="${player.uniqueId}"]`);
        if (playerEl) {
            playerEl.classList.add('active');
        }

        commandAreaEl.classList.remove('hidden');
        renderCommandMenu(player);
        updateCommandMenu(player);

        const commandButtons = commandAreaEl.querySelectorAll('.command-button, .skill-button');
        commandButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                const action = e.target.textContent;
                let target;

                if (['こうげき', 'スキル', 'ひっさつ'].includes(action)) {
                    logMessage('ターゲットを選択してください...');
                    const targets = window.isOnlineMode() ? opponentParty : currentEnemies;
                    target = await selectTarget(targets);
                } else if (action === 'ぼうぎょ') {
                    // 防御はターゲット不要
                }

                if (target || action === 'ぼうぎょ') {
                    commandAreaEl.classList.add('hidden');
                    const actionData = {
                        actorId: player.uniqueId,
                        action: action,
                        targetId: target ? target.uniqueId : null
                    };

                    if (window.isOnlineMode() && window.isHost()) {
                        await executeAction(actionData);
                        window.sendData({ type: 'execute_action', ...actionData });
                    } else if (window.isOnlineMode() && !window.isHost()) {
                        window.sendData({ type: 'execute_action', ...actionData });
                    } else {
                        await executeAction(actionData);
                    }
                    resolve();
                }
            }, { once: true });
        });
        
        // オフラインモードの場合のみ、UIを操作可能に
        if (!window.isOnlineMode()) {
             // 処理は上記イベントリスナーに任せる
        } else {
             // オンラインモードでは、相手の行動を待つ
             if (!window.isHost()) {
                logMessage('相手の行動を待っています...');
                await waitForAction(); // 相手の行動を待機
                resolve();
             }
        }
    });
}

function selectTarget(targets) {
    return new Promise(resolve => {
        const targetElements = document.querySelectorAll('.enemy-character, .player-character');
        targetElements.forEach(el => {
            if (targets.some(t => t.uniqueId === el.dataset.uniqueId)) {
                el.classList.add('selecting-target');
                el.addEventListener('click', (e) => {
                    const targetEl = e.currentTarget;
                    const uniqueId = targetEl.dataset.uniqueId;
                    const target = targets.find(t => t.uniqueId === uniqueId);
                    if (target && target.status.hp > 0) {
                        document.querySelectorAll('.selecting-target').forEach(sel => sel.classList.remove('selecting-target'));
                        resolve(target);
                    }
                }, { once: true });
            }
        });
    });
}

async function enemyTurn(enemy) {
    if (window.isOnlineMode() && !window.isHost()) {
        logMessage("ホストの処理を待っています...");
        return;
    }
    
    // 敵の行動ロジック (旧版と同じ)
    const targets = currentPlayerParty.filter(p => p.status.hp > 0);
    const target = getRandomTarget(targets);
    if (!target) {
        logMessage(`${enemy.name}はターゲットを見つけられませんでした。`, 'info');
        return;
    }
    const actionData = {
        actorId: enemy.uniqueId,
        action: 'こうげき',
        targetId: target.uniqueId
    };
    
    if (window.isOnlineMode() && window.isHost()) {
        await executeAction(actionData);
        window.sendData({ type: 'execute_action', ...actionData });
    } else {
        await executeAction(actionData);
    }
}

// オンライン同期時に、受信したアクションを実行
function executeOnlineAction(actionData) {
    if (!actionData) return;
    const actor = [...currentPlayerParty, ...opponentParty, ...currentEnemies].find(c => c.uniqueId === actionData.actorId);
    const target = [...currentPlayerParty, ...opponentParty, ...currentEnemies].find(c => c.uniqueId === actionData.targetId);

    if (actor && target) {
        if (actionData.action === 'こうげき') {
            performAttack(actor, target);
        } else if (actionData.action === 'スキル' && actor.skills) {
            const skill = actor.skills.find(s => s.name === actionData.skillName); // `skillName` も必要になる
            if (skill) {
                performSkill(actor, target, skill);
            }
        }
    } else {
        console.error('無効なアクションデータを受信しました:', actionData);
    }
    updateAllDisplays();
}

async function executeEnemyAction(data) {
    const actor = [...currentPlayerParty, ...opponentParty].find(c => c.uniqueId === data.actorUniqueId);
    if (!actor) return;
    
    // 敵の行動ロジックを再実行 (クライアント側で計算)
    const targets = currentPlayerParty.filter(p => p.status.hp > 0);
    const target = getRandomTarget(targets);
    if (!target) {
        logMessage(`${actor.name}はターゲットを見つけられませんでした。`, 'info');
        return;
    }

    const actionData = {
        actorId: actor.uniqueId,
        action: 'こうげき',
        targetId: target.uniqueId
    };
    await executeAction(actionData);
    window.sendData({ type: 'execute_action', ...actionData });
}

async function executeAction(actionData) {
    const actor = [...currentPlayerParty, ...currentEnemies].find(c => c.uniqueId === actionData.actorId);
    const target = [...currentPlayerParty, ...currentEnemies].find(c => c.uniqueId === actionData.targetId);
    
    // オンラインモードの場合、相手のデータも探す
    if (window.isOnlineMode()) {
        const onlineActor = [...currentPlayerParty, ...opponentParty].find(c => c.uniqueId === actionData.actorId);
        const onlineTarget = [...currentPlayerParty, ...opponentParty].find(c => c.uniqueId === actionData.targetId);
        if (onlineActor) actor = onlineActor;
        if (onlineTarget) target = onlineTarget;
    }
    
    if (!actor) {
        console.error('Actor not found for action:', actionData);
        return;
    }

    logMessage(`${actor.name}の${actionData.action}！`);

    switch (actionData.action) {
        case 'こうげき':
            if (target) {
                performAttack(actor, target);
            } else {
                logMessage('ターゲットが見つかりません。');
            }
            break;
        case 'ぼうぎょ':
            performDefend(actor);
            break;
        case 'スキル':
            if (target && actor.skills) {
                const skill = actor.skills.find(s => s.name === actionData.skillName); // 適切なスキル名を渡す必要がある
                if (skill) {
                    performSkill(actor, target, skill);
                } else {
                    logMessage('スキルが見つかりません。');
                }
            } else {
                logMessage('ターゲットが見つからないか、スキルがありません。');
            }
            break;
        case 'ひっさつ':
            if (target) {
                performSpecial(actor, target);
            }
            break;
        default:
            logMessage(`不明なコマンド: ${actionData.action}`);
    }
    updateAllDisplays();
    await new Promise(resolve => setTimeout(resolve, 500));
}

function performAttack(attacker, target) {
    let damage = Math.max(1, attacker.status.atk - target.status.def);
    
    if (target.effects.defending) {
        logMessage(`${target.name}は防御している！`);
        damage = Math.floor(damage / 2);
    }
    
    if (Math.random() < attacker.status.critRate) {
        logMessage('クリティカルヒット！', 'critical');
        damage *= 2;
        if (criticalPassiveEffects[attacker.originalId]) {
            damage = criticalPassiveEffects[attacker.originalId](attacker, target, damage);
        }
    }
    
    if (damagePassiveEffects[attacker.originalId]) {
        damage = damagePassiveEffects[attacker.originalId](attacker, target, damage);
    }
    
    target.status.hp = Math.max(0, target.status.hp - damage);
    logMessage(`${target.name}に${damage}のダメージ！`);
    
    // char06のターゲット記憶ロジック
    if (attacker.originalId === 'char06') {
        attacker.targetMemory.lastTargetId = target.uniqueId;
        attacker.targetMemory.missed = (damage === 0);
    }
}

function performDefend(defender) {
    defender.effects.defending = true;
    logMessage(`${defender.name}は身を守っている。`);
}

function performSkill(caster, target, skill) {
    if (caster.status.mp < skill.mpCost) {
        logMessage(`${caster.name}はMPが足りない！`, 'error');
        return;
    }
    
    caster.status.mp -= skill.mpCost;
    logMessage(`${caster.name}は${skill.name}を唱えた！`);
    
    const effectFunction = skillEffects[skill.name];
    if (effectFunction) {
        effectFunction(caster, target);
    }
}

function performSpecial(actor, target) {
    logMessage(`${actor.name}は必殺技を放った！`);
    const specialEffectFunction = skillEffects[actor.specialAbility];
    if (specialEffectFunction) {
        specialEffectFunction(actor, target);
    }
}

// --- Effects & Passives ---

function processStatusEffects(character) {
    if (character.effects.stunned) {
        logMessage(`${character.name}はスタンしていて行動できない！`, 'info');
        delete character.effects.stunned;
        return true;
    }
    return false;
}

function processEndTurnEffects(characters) {
    characters.forEach(c => {
        // 防御効果を解除
        if (c.effects.defending) {
            delete c.effects.defending;
        }
    });
}

function applyPassiveAbilities(characters) {
    characters.forEach(character => {
        if (passiveAbilities[character.originalId]) {
            passiveAbilities[character.originalId](character, characters);
        }
    });
}

function applyEndTurnPassiveAbilities(characters) {
    characters.forEach(character => {
        if (endTurnPassiveAbilities[character.originalId]) {
            endTurnPassiveAbilities[character.originalId](character, characters);
        }
    });
}

// --- UI & Command Menu ---

function renderCommandMenu(player) {
    commandAreaEl.innerHTML = `
        <div class="command-menu">
            <button class="command-button action-attack">こうげき</button>
            <div class="skill-menu hidden"></div>
            <button class="command-button action-special hidden">ひっさつ</button>
            <button class="command-button action-defend">ぼうぎょ</button>
        </div>
    `;
    const attackButton = commandAreaEl.querySelector('.action-attack');
    const defendButton = commandAreaEl.querySelector('.action-defend');
    const skillMenuEl = commandAreaEl.querySelector('.skill-menu');

    attackButton.addEventListener('click', () => {
        // 'こうげき'のアクションは playerTurn で処理される
    });
    defendButton.addEventListener('click', () => {
        // 'ぼうぎょ'のアクションは playerTurn で処理される
    });
    
    if (player.skills && player.skills.length > 0) {
        const skillButton = document.createElement('button');
        skillButton.className = 'command-button action-skill';
        skillButton.textContent = 'スキル';
        commandAreaEl.querySelector('.command-menu').insertBefore(skillButton, defendButton);
        
        skillButton.addEventListener('click', () => {
            attackButton.classList.add('hidden');
            skillButton.classList.add('hidden');
            defendButton.classList.add('hidden');
            commandAreaEl.querySelector('.action-special').classList.add('hidden');
            skillMenuEl.classList.remove('hidden');
        });
        
        skillMenuEl.innerHTML = player.skills.map(skill => {
            return `<button class="skill-button" data-skill-name="${skill.name}">${skill.name}</button>`;
        }).join('');
    }
}

function updateCommandMenu(player) {
    if (!player) return;

    const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
    const specialButtonEl = commandAreaEl.querySelector('.action-special');

    if (skillMenuEl) {
        skillMenuEl.innerHTML = player.skills.map(skill => {
            return `<button class=\"skill-button\" data-skill-name=\"${skill.name}\">${skill.name}</button>`;
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
window.initializePlayerParty = initializePlayerParty;
window.handleOpponentParty = handleOpponentParty;
window.checkBothPartiesReady = checkBothPartiesReady;
window.startOnlineBattle = startOnlineBattle;
window.executeAction = executeAction;
window.handleBattleAction = handleBattleAction;