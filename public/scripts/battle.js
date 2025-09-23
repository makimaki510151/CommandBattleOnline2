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
let currentPlayerParty = null;
let opponentParty = null;
let currentEnemies = null;
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

// --- Display Update Functions ---

function renderParty(partyEl, partyData, isEnemy = false) {
    if (!partyData) return;
    partyEl.innerHTML = partyData.map(member => {
        const className = isEnemy ? 'enemy-character' : 'player-character';
        return `
            <div class="${className}" data-unique-id="${member.uniqueId}">
                <div class="character-name">${member.name}</div>
                <div class="hp-bar">
                    <div class="hp-bar-fill"></div>
                </div>
                <div class="hp-text"></div>
                <div class="mp-bar">
                    <div class="mp-bar-fill"></div>
                </div>
                <div class="mp-text"></div>
            </div>
        `;
    }).join('');
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
    // 画面遷移は既にmain.jsで実行済みなので、戦闘ロジックのみ開始
    logMessage('戦闘開始！');
    isBattleOngoing = true;
    currentTurn = 0;

    // 自分のパーティーを初期化
    currentPlayerParty = initializeParty(partyMembers, 'player');

    // シングルプレイの場合は最初の敵グループから開始
    currentGroupIndex = 0;
    await startNextGroup();
}

// オンライン対戦用：自分のパーティーを準備
function initializePlayerParty(partyData) {
    // ホストなら 'host'、クライアントなら 'client' のpartyTypeを付与
    currentPlayerParty = initializeParty(partyData, window.isHost() ? 'host' : 'client');
    renderParty(playerPartyEl, currentPlayerParty, false); // 自分のパーティーを描画

    // 相手待機中の表示
    enemyPartyEl.innerHTML = '<p class="waiting-message">相手の準備を待っています...</p>';

    myPartyReady = true; // 自分のパーティー準備完了
    logMessage('自分のパーティーの準備が完了しました。');
}

// オンライン対戦用：相手のパーティー情報を受け取る
function handleOpponentParty(partyData) {
    console.log('handleOpponentParty呼び出し:', partyData);

    if (!partyData || !Array.isArray(partyData)) {
        console.error('受信した相手のパーティーデータが無効です。', partyData);
        logMessage('エラー: 相手のパーティー情報の受信に失敗しました。', 'error');
        return;
    }

    console.log('相手のパーティーデータ処理開始, 要素数:', partyData.length);

    // 相手のパーティーを初期化（ホストなら 'client'、クライアントなら 'host' のpartyTypeを付与）
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
        console.log(`相手パーティーメンバー${index}:`, member.name, member.uniqueId);
        return member;
    });

    console.log('相手のパーティー初期化完了:', opponentParty);
    logMessage('相手のパーティー情報を受信しました！');

    console.log('相手パーティーの描画開始');
    renderParty(enemyPartyEl, opponentParty, true);
    console.log('相手パーティーの描画完了');

    opponentPartyReady = true;
    console.log('フラグ状態 - myPartyReady:', myPartyReady, 'opponentPartyReady:', opponentPartyReady);
    checkBothPartiesReady();
}

// 両方のパーティーが準備完了かチェックし、戦闘を開始
function checkBothPartiesReady() {
    console.log('checkBothPartiesReady呼び出し - myPartyReady:', myPartyReady, 'opponentPartyReady:', opponentPartyReady);
    console.log('isHost:', window.isHost());

    if (myPartyReady && opponentPartyReady) {
        console.log('両者の準備が完了しました');
        logMessage('両者の準備が完了しました。');

        if (window.isHost()) {
            // ホストのみが戦闘開始をトリガーする
            console.log('ホストとして戦闘開始処理を実行');
            logMessage('ホストとして戦闘を開始します。');
            window.sendData({ type: 'start_battle' });
            startOnlineBattle();
        } else {
            // クライアントはホストからの同期を待つ
            console.log('クライアントとしてホストの戦闘開始を待機');
            logMessage('ホストからの戦闘開始を待っています...');
        }
    } else {
        console.log('まだ準備が完了していません');
    }
}

// オンライン戦闘開始（ホスト側から呼ばれる）
async function startOnlineBattle() {
    // 画面遷移は既にmain.jsで実行済みなので、戦闘ロジックのみ開始
    isBattleOngoing = true;
    currentTurn = 0;
    logMessage('戦闘開始！');
    // 戦闘ループを開始
    await battleLoop();
}

// クライアント側の戦闘開始処理
function startBattleClientSide() {
    if (isBattleOngoing) return;
    logMessage('ホストが戦闘を開始しました。');
    // 画面遷移は既にmain.jsで実行済みなので、戦闘フラグのみ設定
    isBattleOngoing = true;
    currentTurn = 0;
}

// シングルプレイ用：次の敵グループとの戦闘を開始
async function startNextGroup() {
    if (currentGroupIndex >= enemyGroups.length) {
        handleGameWin();
        return;
    }
    const group = enemyGroups[currentGroupIndex];
    logMessage(`${group.name}との戦闘！`);
    currentEnemies = initializeParty(group.enemies.map(id => enemyData.find(e => e.id === id)), 'enemy');
    renderParty(enemyPartyEl, currentEnemies, true);
    await battleLoop();
}

// --- Core Battle Logic ---

async function battleLoop() {
    // オンラインモードでクライアントの場合は処理を行わない
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
                if (window.isOnlineMode()) {
                    window.sendData({ type: 'sync_game_state', playerParty: currentPlayerParty, opponentParty: opponentParty });
                }
            } else {
                // 敵や相手のキャラクターのターン
                resetHighlights();
                const combatantEl = document.querySelector(`[data-unique-id="${combatant.uniqueId}"]`);
                if (combatantEl) {
                    combatantEl.classList.add('active');
                }

                if (window.isOnlineMode()) {
                    logMessage(`${combatant.name}の行動を待っています...`);
                    // ホストが実行したアクション結果をクライアントが待機
                    await waitForAction();
                } else {
                    await enemyTurn(combatant);
                }
            }
            if (!window.isOnlineMode()) {
                resetHighlights();
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

function waitForAction() {
    return new Promise(resolve => {
        resolveActionPromise = resolve;
    });
}

// --- Battle Action Functions ---

async function selectTarget(actionType, actor) {
    commandAreaEl.classList.add('hidden');
    
    return new Promise(resolve => {
        let targets = [];
        if (actionType === 'attack') {
            const enemyParty = window.isOnlineMode() ? opponentParty : currentEnemies;
            targets = enemyParty.filter(e => e.status.hp > 0);
        } else if (actionType === 'heal') {
            const myParty = currentPlayerParty;
            targets = myParty.filter(p => p.status.hp > 0);
        }

        if (targets.length === 0) {
            logMessage('適切な対象がいません。', 'error');
            resolve(null);
            return;
        }

        // ターゲットをハイライトして選択可能にする
        targets.forEach(target => {
            const targetEl = document.querySelector(`[data-unique-id="${target.uniqueId}"]`);
            if (targetEl) {
                targetEl.classList.add('selecting-target');
            }
        });

        const handleTargetClick = (event) => {
            const targetEl = event.target.closest('.player-character, .enemy-character');
            if (targetEl && targetEl.classList.contains('selecting-target')) {
                const uniqueId = targetEl.dataset.uniqueId;
                const target = targets.find(t => t.uniqueId === uniqueId);
                
                // ハイライトを解除
                document.querySelectorAll('.selecting-target').forEach(el => el.classList.remove('selecting-target'));
                
                // クリックイベントを削除
                document.removeEventListener('click', handleTargetClick);

                resolve({ target: target, actor: actor });
            }
        };
        
        document.addEventListener('click', handleTargetClick);
    });
}

async function executeAction(actionData) {
    const { action, actorUniqueId, targetUniqueId, skillName } = actionData;
    const combatants = window.isOnlineMode()
        ? [...currentPlayerParty, ...opponentParty]
        : [...currentPlayerParty, ...currentEnemies];
    
    const actor = combatants.find(c => c.uniqueId === actorUniqueId);
    const target = combatants.find(c => c.uniqueId === targetUniqueId);

    if (!actor || !target) {
        console.error('Actor or target not found.', actionData);
        return;
    }

    const isOnline = window.isOnlineMode();
    const isHost = window.isHost();
    const isMyCharacter = actor.partyType === (isHost ? 'host' : 'client');
    const isMyTarget = target.partyType === (isHost ? 'host' : 'client');

    let resultMessage = '';

    switch (action) {
        case 'attack':
            const damage = calculateDamage(actor, target);
            resultMessage = `${actor.name}の攻撃！${target.name}に${damage}のダメージ！`;
            target.status.hp -= damage;
            break;
        case 'skill':
            const skill = actor.active.find(s => s.name === skillName);
            const { message, mpUsed } = skillEffects[skill.name](actor, target);
            resultMessage = message;
            if (mpUsed) {
                actor.status.mp -= mpUsed;
            }
            break;
        case 'special':
            // 必殺技の処理
            break;
        case 'defend':
            // 防御の処理
            break;
        default:
            console.error('Unknown action:', action);
            break;
    }
    
    logMessage(resultMessage, 'action');
    updateAllDisplays();

    if (isOnline) {
        if (isHost) {
            // ホストはクライアントに結果を同期
            window.sendData({
                type: 'action_result',
                actorUniqueId,
                targetUniqueId,
                resultMessage,
                updatedActor: actor,
                updatedTarget: target
            });
        }
        // ホスト/クライアント共通で次の行動を待機しているPromiseを解決
        if (resolveActionPromise) {
            resolveActionPromise();
            resolveActionPromise = null;
        }
    }
}

// --- Player Turn Handling ---

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
                const targetInfo = await selectTarget('attack', player);
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
                if (skill && player.status.mp >= skill.mp) {
                    logMessage('スキル対象を選んでください。');
                    const targetInfo = await selectTarget(skill.type, player);
                    if (targetInfo) {
                        actionData = {
                            action: 'skill',
                            actorUniqueId: player.uniqueId,
                            targetUniqueId: targetInfo.target.uniqueId,
                            skillName: skillName
                        };
                    }
                } else {
                    logMessage('MPが足りません！', 'error');
                    return;
                }
            } else if (target.matches('.action-special')) {
                const specialName = target.textContent;
                actionData = {
                    action: 'special',
                    actorUniqueId: player.uniqueId
                };
            } else if (target.matches('.action-defend')) {
                actionData = {
                    action: 'defend',
                    actorUniqueId: player.uniqueId
                };
            }
            
            if (actionData) {
                // コマンドUIを非表示
                commandAreaEl.classList.add('hidden');
                // ハイライトをリセット
                resetHighlights();

                if (window.isOnlineMode()) {
                    // オンラインモードではホストにアクションデータを送信
                    if (window.isHost()) {
                        await executeAction(actionData);
                    } else {
                        window.sendData({
                            type: 'player_action',
                            actionData: actionData
                        });
                        logMessage('相手の行動を待っています...');
                        await waitForAction();
                    }
                } else {
                    // シングルプレイでは即座に実行
                    await executeAction(actionData);
                }
                resolve();
            }
        };

        commandAreaEl.addEventListener('click', handleCommand, { once: true });
    });
}

// --- Enemy Turn Handling ---

async function enemyTurn(enemy) {
    logMessage(`${enemy.name}のターン！`);
    commandAreaEl.classList.add('hidden');
    // シンプルな敵の行動ロジック（ランダムターゲットへの攻撃）
    const target = currentPlayerParty.filter(p => p.status.hp > 0)[0];
    if (target) {
        const actionData = {
            action: 'attack',
            actorUniqueId: enemy.uniqueId,
            targetUniqueId: target.uniqueId
        };
        await executeAction(actionData);
    } else {
        logMessage(`${enemy.name}は行動できなかった。`);
    }
}

// --- Game State Check ---

function isBattleOver() {
    const isPlayerPartyDead = currentPlayerParty.every(p => p.status.hp <= 0);
    const isEnemyPartyDead = window.isOnlineMode()
        ? opponentParty.every(p => p.status.hp <= 0)
        : currentEnemies.every(e => e.status.hp <= 0);

    return isPlayerPartyDead || isEnemyPartyDead;
}

function handleBattleEnd() {
    isBattleOngoing = false;
    resetHighlights();
    commandAreaEl.classList.add('hidden');
    
    if (currentPlayerParty.every(p => p.status.hp <= 0)) {
        handleGameOver();
    } else {
        if (!window.isOnlineMode()) {
            // シングルプレイの場合のみ、次のグループへ進む
            currentGroupIndex++;
            if (currentGroupIndex < enemyGroups.length) {
                logMessage('敵を倒した！次の戦闘へ！');
                setTimeout(() => startNextGroup(), 2000);
            } else {
                handleGameWin();
            }
        } else {
            // オンライン対戦の場合は、勝敗メッセージを表示
            logMessage('戦闘終了！', 'battle-end');
            if (window.isHost()) {
                window.sendData({ type: 'battle_end' });
            }
        }
    }
}

function handleGameOver() {
    logMessage('全滅しました...', 'game-over');
    battleScreenEl.classList.add('hidden');
    partyScreen.classList.remove('hidden');
}

function handleGameWin() {
    logMessage('すべての敵を倒した！', 'game-win');
    battleScreenEl.classList.add('hidden');
    partyScreen.classList.remove('hidden');
}

// --- Status Effects ---

function processStatusEffects(combatant) {
    if (combatant.effects.stun) {
        logMessage(`${combatant.name}はスタンしていて動けない！`, 'status');
        combatant.effects.stun = false; // 1ターンで解除
        return true; // 行動をスキップ
    }
    // その他の状態異常処理を追加
    return false; // 行動を継続
}

function processEndTurnEffects(combatants) {
    combatants.forEach(combatant => {
        if (combatant.status.hp <= 0) return;
        
        // Poison
        if (combatant.effects.poison) {
            const poisonDamage = Math.floor(combatant.status.maxHp * 0.05);
            combatant.status.hp = Math.max(0, combatant.status.hp - poisonDamage);
            logMessage(`${combatant.name}は毒に侵されている！${poisonDamage}のダメージ！`, 'poison');
            updateAllDisplays();
        }
    });
}

// --- Damage Calculation ---

function calculateDamage(attacker, target) {
    let damage = Math.max(1, attacker.status.atk - target.status.def);
    
    // パッシブ効果を適用
    damage = applyDamagePassiveEffects(attacker, target, damage);
    
    // クリティカル判定
    if (Math.random() < (attacker.status.lck / 100)) {
        damage = Math.floor(damage * 1.5);
        logMessage('クリティカルヒット！', 'critical');
        // クリティカル時パッシブ効果
        if (criticalPassiveEffects[attacker.originalId]) {
            const effectMessage = criticalPassiveEffects[attacker.originalId](attacker, target);
            if (effectMessage) {
                logMessage(effectMessage, 'critical-effect');
            }
        }
    }
    return damage;
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

// --- Command Menu Display ---

function createCommandMenu(player) {
    return `
        <div class="command-menu">
            <button class="command-button action-attack">こうげき</button>
            <button class="command-button action-skill">スキル</button>
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

// --- Global Access for main.js ---
window.getPlayerParty = () => currentPlayerParty;
window.startBattle = startBattle;
window.initializePlayerParty = initializePlayerParty;
window.handleOpponentParty = handleOpponentParty;
window.startOnlineBattle = startOnlineBattle;
window.executeAction = executeAction;
window.checkBothPartiesReady = checkBothPartiesReady;

// オンライン同期用のアクションハンドラ
window.handleBattleAction = (data) => {
    if (data.type === 'sync_game_state') {
        currentPlayerParty = data.playerParty;
        opponentParty = data.opponentParty;
        currentTurn = data.currentTurn;
        isBattleOngoing = data.isBattleOngoing;
        updateAllDisplays();
        logMessage('ゲーム状態を同期しました。');
    } else if (data.type === 'action_result') {
        const { actorUniqueId, targetUniqueId, resultMessage, updatedActor, updatedTarget } = data;
        const actor = getCombatantByUniqueId(actorUniqueId);
        const target = getCombatantByUniqueId(targetUniqueId);
        if (actor && updatedActor) {
            Object.assign(actor.status, updatedActor.status);
            Object.assign(actor.effects, updatedActor.effects);
        }
        if (target && updatedTarget) {
            Object.assign(target.status, updatedTarget.status);
            Object.assign(target.effects, updatedTarget.effects);
        }
        logMessage(resultMessage, 'action');
        updateAllDisplays();
        // 行動待機中のPromiseを解決
        if (resolveActionPromise) {
            resolveActionPromise();
            resolveActionPromise = null;
        }
    } else if (data.type === 'player_action') {
        if (window.isHost()) {
            executeAction(data.actionData);
        }
    } else if (data.type === 'start_battle') {
        startBattleClientSide();
    } else if (data.type === 'log_message') {
        logMessage(data.message, data.messageType);
    } else if (data.type === 'battle_end') {
        logMessage('戦闘終了！', 'battle-end');
        handleBattleEnd();
    } else if (data.type === 'party_data') {
        handleOpponentParty(data.party);
    }
};

function getCombatantByUniqueId(uniqueId) {
    const combinedParty = [...currentPlayerParty, ...(opponentParty || []), ...(currentEnemies || [])];
    return combinedParty.find(c => c.uniqueId === uniqueId);
}