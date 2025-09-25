// battle.js (戦闘終了機能完全版)

import { enemyData, enemyGroups } from './enemies.js';
import { characters } from './characters.js';
import { passiveAbilities, endTurnPassiveAbilities, specialAbilityConditions, skillEffects, damagePassiveEffects, criticalPassiveEffects } from './character_abilities.js';

// DOM Elements
const enemyPartyEl = document.getElementById('enemy-party');
const playerPartyEl = document.getElementById('player-party');
const messageLogEl = document.getElementById('message-log');
const commandAreaEl = document.getElementById('command-area');
const battleScreenEl = document.getElementById('battle-screen');
const partyScreen = document.getElementById('party-screen');

// Game State
let currentPlayerParty = null;
let opponentParty = null;
let currentEnemies = null;
let currentTurn = 0;
let isBattleOngoing = false;
let currentGroupIndex = 0;

let myPartyReady = false;
let opponentPartyReady = false;

let uniqueIdCounter = 0;

// クライアント側で行動を待機するためのPromise
let resolveClientActionPromise = null;

// 攻撃ボタンの連打防止用フラグ
let isActionInProgress = false;
// スキルメニュー表示状態を管理するフラグ
let isSkillMenuOpen = false;

// --- Utility Functions ---

function generateUniqueId() {
    return `unique_${Date.now()}_${uniqueIdCounter++}`;
}

// ログメッセージを同期する関数
function logMessage(message, type = '') {
    if (window.logMessage) {
        window.logMessage(message, type);
    }

    // オンラインモードでホストの場合、ログをクライアントに送信
    if (window.isOnlineMode() && window.isHost()) {
        window.sendData('log_message', { message: message, type: type });
    }
}

function deepCopy(obj) {
    if (obj === undefined) {
        return undefined;
    }
    return JSON.parse(JSON.stringify(obj));
}

// --- Highlight Functions ---

function resetHighlights() {
    document.querySelectorAll('.character-card, .player-character, .enemy-character').forEach(card => {
        card.classList.remove('active', 'selectable');
    });
}

function highlightActiveCharacter(uniqueId) {
    resetHighlights();
    const characterEl = document.querySelector(`[data-unique-id="${uniqueId}"]`);
    if (characterEl) {
        characterEl.classList.add('active');
        logMessage(`${getCharacterName(uniqueId)}が行動中...`, 'character-turn');
    }
}

function highlightSelectableTargets(targets) {
    // まず全ての選択可能スタイルをリセット
    document.querySelectorAll('.character-card, .player-character, .enemy-character').forEach(card => {
        card.classList.remove('selectable');
    });

    // 生きているターゲットのみを選択可能にする
    targets.filter(target => target.status.hp > 0).forEach(target => {
        const targetEl = document.querySelector(`[data-unique-id="${target.uniqueId}"]`);
        if (targetEl) {
            targetEl.classList.add('selectable');
        }
    });
}

function getCharacterName(uniqueId) {
    const allCombatants = [...(currentPlayerParty || []), ...(opponentParty || []), ...(currentEnemies || [])];
    const character = allCombatants.find(c => c.uniqueId === uniqueId);
    return character ? character.name : '不明';
}

// --- Battle End Functions ---

function showBattleEndUI(isVictory, survivors) {
    const battleEndOverlay = document.createElement('div');
    battleEndOverlay.id = 'battle-end-overlay';
    battleEndOverlay.className = 'battle-result-overlay show';

    const survivorNames = survivors.map(char => char.name).join('、');
    const resultMessage = isVictory
        ? `勝利したキャラクター: ${survivorNames}`
        : '全てのキャラクターが倒れました...';

    battleEndOverlay.innerHTML = `
        <div class="battle-result-container">
            <h1 class="battle-result-title">${isVictory ? '勝利！' : '敗北...'}</h1>
            <p class="battle-result-message">${resultMessage}</p>
            ${window.isHost() ? '<button class="battle-result-button" id="return-to-party-button">キャラ選択画面に戻る</button>' : '<p class="waiting-message">ホストがキャラ選択画面に戻るのを待っています...</p>'}
        </div>
    `;

    battleScreenEl.appendChild(battleEndOverlay);

    // ホストの場合のみイベントリスナーを設定
    if (window.isHost()) {
        const returnButton = document.getElementById('return-to-party-button');
        if (returnButton) {
            returnButton.addEventListener('click', () => {
                // ホストが戻るアクションを実行し、その情報をクライアントに送信
                returnToPartyScreen();
                // クライアントにパーティー画面に戻るよう通知
                if (window.sendData) {
                    window.sendData('return_to_party_screen', {});
                }
            });
        }
    }
}

window.returnToPartyScreen = function () {
    // 戦闘状態をリセット
    resetBattleState();

    // 画面を切り替え
    battleScreenEl.classList.add('hidden');
    if (partyScreen) {
        partyScreen.classList.remove('hidden');
    }

    // 戦闘終了オーバーレイを削除
    const overlay = document.getElementById('battle-end-overlay');
    if (overlay) {
        overlay.remove();
    }

    // ログもクリア
    if (messageLogEl) {
        messageLogEl.innerHTML = '';
    }

    logMessage('キャラクター選択画面に戻りました。', 'system');
};

function resetBattleState() {
    // 戦闘状態をリセット
    currentPlayerParty = null;
    opponentParty = null;
    currentEnemies = null;
    currentTurn = 0;
    isBattleOngoing = false;
    myPartyReady = false;
    opponentPartyReady = false;

    // ハイライトをリセット
    resetHighlights();

    // コマンドエリアを隠す
    if (commandAreaEl) {
        commandAreaEl.classList.add('hidden');
    }

    // パーティー表示をクリア
    if (playerPartyEl) playerPartyEl.innerHTML = '';
    if (enemyPartyEl) enemyPartyEl.innerHTML = '';

    isActionInProgress = false; // フラグをリセット
    isSkillMenuOpen = false; // フラグをリセット
}

// --- Display Update Functions ---

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
        if (hpText) hpText.textContent = `${member.status.hp} / ${member.status.maxHp}`;

        if (mpFill && member.status.maxMp > 0) {
            const mpPercentage = (member.status.mp / member.status.maxMp) * 100;
            mpFill.style.width = `${mpPercentage}%`;
        }
        if (mpText) mpText.textContent = `${member.status.mp} / ${member.status.maxMp}`;

        if (member.status.hp <= 0) {
            memberEl.classList.add('fainted');
        } else {
            memberEl.classList.remove('fainted');
        }
    });
}

function updateAllDisplays() {
    if (window.isOnlineMode()) {
        updatePartyDisplay(playerPartyEl, currentPlayerParty);
        updatePartyDisplay(enemyPartyEl, opponentParty);
    } else {
        updatePartyDisplay(playerPartyEl, currentPlayerParty);
        updatePartyDisplay(enemyPartyEl, currentEnemies);
    }
}

// --- Battle Initialization ---

function initializeParty(party, partyType = 'player') {
    return party.map((p, index) => {
        const member = deepCopy(p);
        member.uniqueId = generateUniqueId();
        member.originalId = member.id;
        member.partyType = partyType;
        member.partyIndex = index;
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
    currentPlayerParty = initializeParty(partyMembers, 'player');
    currentGroupIndex = 0;
    //await startNextGroup(); // シングルプレイ用は今回は省略
}

function initializePlayerParty(partyData) {
    if (currentPlayerParty && currentPlayerParty.length > 0) {
        return;
    }
    const partyType = window.isHost() ? 'host' : 'client';
    currentPlayerParty = initializeParty(partyData, partyType);

    myPartyReady = true;
    logMessage('自分のパーティーの準備が完了しました。');

    // 両者の準備完了をチェック
    checkBothPartiesReady();
}

function handleOpponentParty(partyData) {
    if (opponentParty && opponentParty.length > 0) {
        return;
    }

    // ホストから見ると、クライアントのパーティーが相手になる
    const partyType = window.isHost() ? 'client' : 'host';
    opponentParty = initializeParty(partyData, partyType);
    logMessage('対戦相手のパーティー情報を受信しました！');

    opponentPartyReady = true;
    // 両者の準備完了をチェック
    checkBothPartiesReady();
}

function checkBothPartiesReady() {
    if (myPartyReady && opponentPartyReady) {
        logMessage("両者の準備が完了しました。", 'system');

        // ★修正★
        // ここでフラグを立てることで、handleBattleEndが実行可能になる
        isBattleOngoing = true;

        // ホストの場合のみ戦闘開始イベントを送信
        if (window.isHost()) {
            startOnlineBattleHostSide();
        }
    }
}

async function startOnlineBattleHostSide() {
    isBattleOngoing = true;
    currentTurn = 0;
    logMessage("戦闘開始！", 'system');

    // ホスト側も自分のパーティーと相手のパーティーを描画
    renderParty(playerPartyEl, currentPlayerParty, false);
    renderParty(enemyPartyEl, opponentParty, true);

    // クライアントに戦闘開始を通知
    window.sendData('start_battle', {
        initialState: {
            playerParty: currentPlayerParty, // ホストのパーティー
            opponentParty: opponentParty, // クライアントのパーティー
            currentTurn: 0,
            isBattleOngoing: true
        }
    });

    // 戦闘ループを開始
    await battleLoop();
}

function startOnlineBattleClientSide(initialState) {
    isBattleOngoing = true;
    logMessage("戦闘開始！ホストからの行動を待っています...", 'turn-start');

    // ホストから送られてきたデータを基にパーティーを設定
    // ホストのplayerPartyがクライアントのopponentParty
    opponentParty = initialState.playerParty;
    // ホストのopponentPartyがクライアントのcurrentPlayerParty
    currentPlayerParty = initialState.opponentParty;

    // パーティーの描画を更新
    renderParty(playerPartyEl, currentPlayerParty, false);
    renderParty(enemyPartyEl, opponentParty, true);
}

// --- Core Battle Logic ---

async function battleLoop() {
    if (!window.isOnlineMode() || window.isHost()) {
        while (isBattleOngoing) {
            if (isBattleOver()) {
                handleBattleEnd();
                break;
            }

            logMessage(`=== ターン ${currentTurn + 1} 開始 ===`, 'turn-start');

            const combatants = [...currentPlayerParty, ...opponentParty];
            const aliveCombatants = combatants.filter(c => c.status.hp > 0);
            applyPassiveAbilities(aliveCombatants);
            aliveCombatants.sort((a, b) => b.status.spd - a.status.spd || Math.random() - 0.5);

            logMessage(`行動順: ${aliveCombatants.map(c => c.name).join(' → ')}`);

            for (const combatant of aliveCombatants) {
                if (isBattleOver()) break;
                if (combatant.status.hp <= 0) continue;

                const actionSkipped = processStatusEffects(combatant);
                if (actionSkipped) continue;

                const isHostCharacter = combatant.partyType === 'host';
                const isClientCharacter = combatant.partyType === 'client';

                if (isHostCharacter) {
                    await playerTurn(combatant);
                } else if (isClientCharacter) {
                    highlightActiveCharacter(combatant.uniqueId);
                    logMessage(`${combatant.name}の行動を待っています...`);
                    window.sendData('request_action', { actorUniqueId: combatant.uniqueId });
                    await new Promise(resolve => {
                        resolveClientActionPromise = resolve;
                    });
                }

                // ホスト側でアクション結果を同期
                window.sendData('sync_game_state', {
                    playerParty: currentPlayerParty,
                    opponentParty: opponentParty,
                    currentTurn: currentTurn,
                    isBattleOngoing: isBattleOngoing
                });
            }

            processEndTurnEffects(aliveCombatants);
            applyEndTurnPassiveAbilities(aliveCombatants);
            updateAllDisplays();

            if (isBattleOver()) {
                handleBattleEnd();
                break;
            }

            currentTurn++;
            resetHighlights(); // ターン終了時にハイライトをリセット
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } else {
        logMessage("ホストからの行動を待っています...");
    }
}

// ホスト側のプレイヤーの行動を処理する関数
async function playerTurn(actor) {
    highlightActiveCharacter(actor.uniqueId);
    logMessage(`${actor.name}のターン！`, 'character-turn');
    commandAreaEl.classList.remove('hidden');
    updateCommandMenu(actor);

    return new Promise(resolve => {
        const handleCommand = async (event) => {
            if (isActionInProgress) return;

            const target = event.target;
            let actionData = null;
            let targetUniqueId = null;

            if (target.matches('.action-attack')) {
                isActionInProgress = true;
                disableCommandButtons(true);
                logMessage('攻撃対象を選んでください。');
                const targetInfo = await selectTarget();
                if (targetInfo) {
                    targetUniqueId = targetInfo.target.uniqueId;
                    actionData = { action: 'attack', actorUniqueId: actor.uniqueId, targetUniqueId: targetUniqueId };
                } else {
                    isActionInProgress = false;
                    disableCommandButtons(false);
                    logMessage('行動をキャンセルしました。');
                    return;
                }
            } else if (target.matches('.action-defend')) {
                isActionInProgress = true;
                disableCommandButtons(true);
                logMessage('自身を選択して防御を確定してください。');
                const targetInfo = await selectTarget(true, [actor]);
                if (targetInfo) {
                    actionData = { action: 'defend', actorUniqueId: actor.uniqueId };
                } else {
                    isActionInProgress = false;
                    disableCommandButtons(false);
                    logMessage('行動をキャンセルしました。');
                    return;
                }
            } else if (target.matches('.action-skill')) {
                const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
                if (skillMenuEl) {
                    skillMenuEl.classList.toggle('hidden');
                    isSkillMenuOpen = !skillMenuEl.classList.contains('hidden');
                    if (isSkillMenuOpen) {
                        addCancelButton(actor, resolve, handleCommand);
                    } else {
                        removeCancelButton();
                    }
                }
                return;
            } else if (target.matches('.skill-button')) {
                isActionInProgress = true;
                disableCommandButtons(true);
                const skillName = target.textContent;
                const skill = actor.active.find(s => s.name === skillName);
                if (skill) {
                    if (actor.status.mp < skill.mp) {
                        logMessage(`MPが足りません！`);
                        isActionInProgress = false;
                        disableCommandButtons(false);
                        return;
                    }
                    if (skill.target === 'single' || skill.target === 'ally_single') {
                        logMessage('スキル対象を選んでください。');
                        const targetInfo = await selectTarget(skill.target === 'ally_single');
                        if (targetInfo) {
                            targetUniqueId = targetInfo.target.uniqueId;
                            actionData = { action: 'skill', actorUniqueId: actor.uniqueId, skillName: skill.name, targetUniqueId: targetUniqueId };
                        } else {
                            isActionInProgress = false;
                            disableCommandButtons(false);
                            logMessage('行動をキャンセルしました。');
                            return;
                        }
                    } else if (skill.target === 'self') {
                        logMessage('自身を選択してください。');
                        const targetInfo = await selectTarget(true, [actor]);
                        if (targetInfo) {
                            targetUniqueId = targetInfo.target.uniqueId;
                            actionData = { action: 'skill', actorUniqueId: actor.uniqueId, skillName: skill.name, targetUniqueId: targetUniqueId };
                        } else {
                            isActionInProgress = false;
                            disableCommandButtons(false);
                            logMessage('行動をキャンセルしました。');
                            return;
                        }
                    } else { // all_enemies, all_allies
                        actionData = { action: 'skill', actorUniqueId: actor.uniqueId, skillName: skill.name };
                    }
                }
            } else if (target.matches('.action-special')) {
                isActionInProgress = true;
                disableCommandButtons(true);
                const special = actor.special;
                if (special) {
                    if (actor.status.mp < special.mp) {
                        logMessage(`MPが足りません！`);
                        isActionInProgress = false;
                        disableCommandButtons(false);
                        return;
                    }
                    if (special.target === 'single' || special.target === 'ally_single') {
                        logMessage('必殺技の対象を選んでください。');
                        const targetInfo = await selectTarget(special.target === 'ally_single');
                        if (targetInfo) {
                            targetUniqueId = targetInfo.target.uniqueId;
                            actionData = { action: 'special', actorUniqueId: actor.uniqueId, specialName: special.name, targetUniqueId: targetUniqueId };
                        } else {
                            isActionInProgress = false;
                            disableCommandButtons(false);
                            logMessage('行動をキャンセルしました。');
                            return;
                        }
                    } else if (special.target === 'self') {
                        logMessage('自身を選択してください。');
                        const targetInfo = await selectTarget(true, [actor]);
                        if (targetInfo) {
                            targetUniqueId = targetInfo.target.uniqueId;
                            actionData = { action: 'special', actorUniqueId: actor.uniqueId, specialName: special.name, targetUniqueId: targetUniqueId };
                        } else {
                            isActionInProgress = false;
                            disableCommandButtons(false);
                            logMessage('行動をキャンセルしました。');
                            return;
                        }
                    } else { // all_enemies, all_allies
                        actionData = { action: 'special', actorUniqueId: actor.uniqueId, specialName: special.name };
                    }
                }
            } else if (target.matches('.action-cancel')) {
                isActionInProgress = false;
                disableCommandButtons(false);
                removeCancelButton();
                const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
                if (skillMenuEl && !skillMenuEl.classList.contains('hidden')) {
                    skillMenuEl.classList.add('hidden');
                    isSkillMenuOpen = false;
                }
                logMessage('行動をキャンセルしました。');
                return;
            }

            if (actionData) {
                isActionInProgress = false;
                commandAreaEl.removeEventListener('click', handleCommand);
                commandAreaEl.classList.add('hidden');
                removeCancelButton();
                executeAction(actionData);
                resolve();
            }
        };
        commandAreaEl.addEventListener('click', handleCommand);
    });
}

// コマンドボタンの有効/無効を切り替える関数
function disableCommandButtons(disable) {
    const buttons = commandAreaEl.querySelectorAll('.command-button, .skill-button');
    buttons.forEach(button => {
        // スキルメニューの表示/非表示を切り替えるボタンは無効化しない
        if (!button.classList.contains('action-skill')) {
            button.disabled = disable;
        }
    });
}

// キャンセルボタンを追加する関数
function addCancelButton(actor, resolve, handleCommand) {
    if (!commandAreaEl.querySelector('.action-cancel')) {
        const cancelButton = document.createElement('button');
        cancelButton.className = 'command-button action-cancel';
        cancelButton.textContent = 'キャンセル';
        commandAreaEl.appendChild(cancelButton);
    }
}

// キャンセルボタンを削除する関数
function removeCancelButton() {
    const cancelButton = commandAreaEl.querySelector('.action-cancel');
    if (cancelButton) {
        cancelButton.remove();
    }
}

// クライアントからのアクション実行要求
window.handleActionRequest = async (data) => {
    const actor = currentPlayerParty.find(c => c.uniqueId === data.actorUniqueId);
    if (!actor) return;

    highlightActiveCharacter(actor.uniqueId);
    logMessage(`${actor.name}のターン！`, 'character-turn');

    commandAreaEl.classList.remove('hidden');
    updateCommandMenu(actor);

    await new Promise(resolve => {
        const handleCommand = async (event) => {
            if (isActionInProgress) return;

            const target = event.target;
            let actionData = null;
            let targetUniqueId = null;

            if (target.matches('.action-attack')) {
                isActionInProgress = true;
                disableCommandButtons(true);
                logMessage('攻撃対象を選んでください。');
                const targetInfo = await selectTarget();
                if (targetInfo) {
                    targetUniqueId = targetInfo.target.uniqueId;
                    actionData = { action: 'attack', targetUniqueId: targetUniqueId };
                } else {
                    isActionInProgress = false;
                    disableCommandButtons(false);
                    logMessage('行動をキャンセルしました。');
                    return;
                }
            } else if (target.matches('.action-defend')) {
                isActionInProgress = true;
                disableCommandButtons(true);
                logMessage('自身を選択して防御を確定してください。');
                const targetInfo = await selectTarget(true, [actor]);
                if (targetInfo) {
                    actionData = { action: 'defend' };
                } else {
                    isActionInProgress = false;
                    disableCommandButtons(false);
                    logMessage('行動をキャンセルしました。');
                    return;
                }
            } else if (target.matches('.action-skill')) {
                const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
                if (skillMenuEl) {
                    skillMenuEl.classList.toggle('hidden');
                    isSkillMenuOpen = !skillMenuEl.classList.contains('hidden');
                    if (isSkillMenuOpen) {
                        addCancelButton(actor, resolve, handleCommand);
                    } else {
                        removeCancelButton();
                    }
                }
                return;
            } else if (target.matches('.skill-button')) {
                isActionInProgress = true;
                disableCommandButtons(true);
                const skillName = target.textContent;
                const skill = actor.active.find(s => s.name === skillName);
                if (skill) {
                    if (actor.status.mp < skill.mp) {
                        logMessage(`MPが足りません！`);
                        isActionInProgress = false;
                        disableCommandButtons(false);
                        return;
                    }
                    if (skill.target === 'single' || skill.target === 'ally_single') {
                        logMessage('スキル対象を選んでください。');
                        const targetInfo = await selectTarget(skill.target === 'ally_single');
                        if (targetInfo) {
                            targetUniqueId = targetInfo.target.uniqueId;
                            actionData = { action: 'skill', skillName: skill.name, targetUniqueId: targetUniqueId };
                        } else {
                            isActionInProgress = false;
                            disableCommandButtons(false);
                            logMessage('行動をキャンセルしました。');
                            return;
                        }
                    } else if (skill.target === 'self') {
                        logMessage('自身を選択してください。');
                        const targetInfo = await selectTarget(true, [actor]);
                        if (targetInfo) {
                            targetUniqueId = targetInfo.target.uniqueId;
                            actionData = { action: 'skill', skillName: skill.name, targetUniqueId: targetUniqueId };
                        } else {
                            isActionInProgress = false;
                            disableCommandButtons(false);
                            logMessage('行動をキャンセルしました。');
                            return;
                        }
                    } else {
                        actionData = { action: 'skill', skillName: skill.name };
                    }
                }
            } else if (target.matches('.action-special')) {
                isActionInProgress = true;
                disableCommandButtons(true);
                const special = actor.special;
                if (special) {
                    if (actor.status.mp < special.mp) {
                        logMessage(`MPが足りません！`);
                        isActionInProgress = false;
                        disableCommandButtons(false);
                        return;
                    }
                    if (special.target === 'single' || special.target === 'ally_single') {
                        logMessage('必殺技の対象を選んでください。');
                        const targetInfo = await selectTarget(special.target === 'ally_single');
                        if (targetInfo) {
                            targetUniqueId = targetInfo.target.uniqueId;
                            actionData = { action: 'special', specialName: special.name, targetUniqueId: targetUniqueId };
                        } else {
                            isActionInProgress = false;
                            disableCommandButtons(false);
                            logMessage('行動をキャンセルしました。');
                            return;
                        }
                    } else if (special.target === 'self') {
                        logMessage('自身を選択してください。');
                        const targetInfo = await selectTarget(true, [actor]);
                        if (targetInfo) {
                            targetUniqueId = targetInfo.target.uniqueId;
                            actionData = { action: 'special', specialName: special.name, targetUniqueId: targetUniqueId };
                        } else {
                            isActionInProgress = false;
                            disableCommandButtons(false);
                            logMessage('行動をキャンセルしました。');
                            return;
                        }
                    } else {
                        actionData = { action: 'special', specialName: special.name };
                    }
                }
            } else if (target.matches('.action-cancel')) {
                isActionInProgress = false;
                disableCommandButtons(false);
                removeCancelButton();
                const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
                if (skillMenuEl && !skillMenuEl.classList.contains('hidden')) {
                    skillMenuEl.classList.add('hidden');
                    isSkillMenuOpen = false;
                }
                logMessage('行動をキャンセルしました。');
                return;
            }

            if (actionData) {
                isActionInProgress = false;
                commandAreaEl.removeEventListener('click', handleCommand);
                commandAreaEl.classList.add('hidden');
                removeCancelButton();
                actionData.actorUniqueId = actor.uniqueId;
                window.sendData('execute_action', actionData);
                resolve();
            }
        };
        commandAreaEl.addEventListener('click', handleCommand);
    });
};

window.executeAction = (data) => {
    // オンラインモードか否かで戦闘参加者の配列を正しく生成
    let allCombatants = [];
    if (window.isOnlineMode()) {
        allCombatants = [...currentPlayerParty, ...opponentParty];
    } else {
        allCombatants = [...currentPlayerParty, ...currentEnemies];
    }

    const actor = allCombatants.find(c => c.uniqueId === data.actorUniqueId);
    if (!actor) {
        console.error('Actor not found:', data.actorUniqueId, allCombatants);
        return;
    }

    switch (data.action) {
        case 'attack':
            const target = allCombatants.find(c => c.uniqueId === data.targetUniqueId);
            if (target) {
                performAttack(actor, target);
            }
            break;
        case 'defend':
            actor.isDefending = true;
            logMessage(`${actor.name}は防御した。`);
            break;
        case 'skill':
            const skill = actor.active.find(s => s.name === data.skillName);
            if (skill) {
                const skillTargets = [];
                if (skill.target === 'single' || skill.target === 'ally_single' || skill.target === 'self') {
                    const targetChar = allCombatants.find(c => c.uniqueId === data.targetUniqueId);
                    if (targetChar) skillTargets.push(targetChar);
                } else if (skill.target === 'all_enemies') {
                    const enemies = opponentParty.filter(o => o.partyType !== actor.partyType);
                    skillTargets.push(...enemies.filter(e => e.status.hp > 0));
                } else if (skill.target === 'all_allies') {
                    const allies = currentPlayerParty.filter(p => p.partyType === actor.partyType);
                    skillTargets.push(...allies.filter(a => a.status.hp > 0));
                }
                executeSkill(actor, skill, skillTargets);
            }
            break;
        case 'special':
            const special = actor.special;
            if (special && special.name === data.specialName) {
                const specialTargets = [];
                if (special.target === 'single' || special.target === 'ally_single' || special.target === 'self') {
                    const targetChar = allCombatants.find(c => c.uniqueId === data.targetUniqueId);
                    if (targetChar) specialTargets.push(targetChar);
                } else if (special.target === 'all_enemies') {
                    const enemies = opponentParty.filter(o => o.partyType !== actor.partyType);
                    specialTargets.push(...enemies.filter(e => e.status.hp > 0));
                } else if (special.target === 'all_allies') {
                    const allies = currentPlayerParty.filter(p => p.partyType === actor.partyType);
                    specialTargets.push(...allies.filter(a => a.status.hp > 0));
                }
                executeSpecial(actor, special, specialTargets);
            }
            break;
    }

    updateAllDisplays();

    // ホストとしてクライアントのアクション実行を受け取った場合
    if (window.isOnlineMode() && window.isHost() && data.actorUniqueId) {
        const isClientCharacter = opponentParty.some(c => c.uniqueId === data.actorUniqueId);
        if (isClientCharacter && resolveClientActionPromise) {
            resolveClientActionPromise();
            resolveClientActionPromise = null;
        }
    }
};

function calculateDamage(attacker, target, isMagic = false) {
    let attackPower;
    let defensePower;
    let damageMultiplier = 1;
    let isCritical = false;
    let isDodged = false;

    if (isMagic) {
        attackPower = attacker.status.matk;
        defensePower = target.status.mdef;
    } else {
        attackPower = attacker.status.atk;
        defensePower = target.status.def;
    }

    let dodgeRate = target.status.dodgeRate || 0;
    if (target.effects.accuracyDebuff) {
        dodgeRate /= target.effects.accuracyDebuff.value;
    }
    if (attacker.effects.dodgeDebuff) {
        dodgeRate *= attacker.effects.dodgeDebuff.value;
    }

    if (Math.random() < dodgeRate) {
        isDodged = true;
        return { damage: 0, critical: false, dodged: true };
    }

    let criticalRate = attacker.status.criticalRate;
    if (criticalPassiveEffects[attacker.originalId]) {
        criticalRate = criticalPassiveEffects[attacker.originalId](attacker, target, criticalRate);
    }

    if (Math.random() < criticalRate) {
        isCritical = true;
        damageMultiplier *= attacker.status.criticalMultiplier;
    }

    let damage = Math.max(1, Math.floor((attackPower * damageMultiplier) - (defensePower / 2)));

    if (damagePassiveEffects[attacker.originalId]) {
        damage = damagePassiveEffects[attacker.originalId](attacker, target, damage, !isMagic);
    }

    return { damage, critical: isCritical, dodged: isDodged };
}

function performAttack(attacker, target) {
    logMessage(`${attacker.name}の攻撃！`);
    const { damage, critical, dodged } = calculateDamage(attacker, target, false);

    if (dodged) {
        logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
    } else {
        if (critical) logMessage(`会心の一撃！`, 'special-event');
        logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
        target.status.hp = Math.max(0, target.status.hp - damage);
        if (target.status.hp <= 0) {
            target.status.hp = 0;
            logMessage(`${target.name}は倒れた...`, 'fainted');
        }
    }
    updateAllDisplays();
}

function selectTarget(selectAlly = false, allowedTargets = null) {
    return new Promise(resolve => {
        const potentialTargets = allowedTargets 
            ? allowedTargets 
            : (selectAlly ? currentPlayerParty : (window.isOnlineMode() ? opponentParty : currentEnemies));

        if (!potentialTargets) {
            resolve(null);
            return;
        }

        const aliveTargets = potentialTargets.filter(e => e.status.hp > 0);
        if (aliveTargets.length === 0) {
            resolve(null);
            return;
        }

        highlightSelectableTargets(aliveTargets);

        const targetSelectionOverlay = document.createElement('div');
        targetSelectionOverlay.id = 'target-selection-overlay';
        targetSelectionOverlay.innerHTML = '<p>ターゲットを選択してください</p><button id="cancel-target-selection" class="command-button action-cancel">キャンセル</button>';
        targetSelectionOverlay.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8); color: white; padding: 10px 20px;
            border-radius: 10px; z-index: 1000; font-size: 1.2em; font-weight: bold;
            display: flex; align-items: center; gap: 10px;
        `;
        battleScreenEl.appendChild(targetSelectionOverlay);

        const clickHandler = (event) => {
            if (event.target.id === 'cancel-target-selection') {
                cleanup();
                resolve(null);
                return;
            }

            const targetEl = event.target.closest('.character-card');
            if (targetEl && targetEl.classList.contains('selectable')) {
                const uniqueId = targetEl.dataset.uniqueId;
                const selectedTarget = aliveTargets.find(t => t.uniqueId === uniqueId);
                if (selectedTarget) {
                    cleanup();
                    resolve({ target: selectedTarget, element: targetEl });
                }
            }
        };

        const cleanup = () => {
            targetSelectionOverlay.remove();
            resetHighlights();
            document.removeEventListener('click', clickHandler, true);
        };
        
        document.addEventListener('click', clickHandler, true);
    });
}

function renderParty(containerEl, party, isOpponent = false) {
    if (!containerEl) {
        console.error('Container element for party is null.');
        return;
    }
    containerEl.innerHTML = '';

    party.forEach(char => {
        const charEl = document.createElement('div');
        charEl.className = 'character-card';
        charEl.dataset.uniqueId = char.uniqueId;

        charEl.innerHTML = `
            <img src="${char.image}" alt="${char.name}" class="char-icon">
            <p class="char-name">${char.name}</p>
            <div class="hp-bar-container">
                <div class="hp-bar-fill" style="width: ${Math.max(0, char.status.hp / char.status.maxHp) * 100}%"></div>
            </div>
            <p class="hp-text">${char.status.hp} / ${char.status.maxHp}</p>
            <div class="mp-bar-container">
                <div class="mp-bar-fill" style="width: ${Math.max(0, char.status.mp / char.status.maxMp) * 100}%"></div>
            </div>
            <p class="mp-text">${char.status.mp} / ${char.status.maxMp}</p>
        `;
        containerEl.appendChild(charEl);
    });
}

function updateCommandMenu(player) {
    commandAreaEl.innerHTML = '';

    const attackButton = document.createElement('button');
    attackButton.className = 'command-button action-attack';
    attackButton.textContent = '攻撃';
    commandAreaEl.appendChild(attackButton);

    const skillButton = document.createElement('button');
    skillButton.className = 'command-button action-skill';
    skillButton.textContent = 'スキル';
    commandAreaEl.appendChild(skillButton);

    const skillMenuEl = document.createElement('div');
    skillMenuEl.className = `skill-menu ${isSkillMenuOpen ? '' : 'hidden'}`;

    if (player.active) {
        player.active.forEach(skill => {
            const skillItem = document.createElement('div');
            skillItem.className = 'skill-item';

            const skillBtn = document.createElement('button');
            skillBtn.className = 'skill-button';
            skillBtn.dataset.skillName = skill.name;
            skillBtn.textContent = skill.name;

            const skillDesc = document.createElement('div');
            skillDesc.className = 'skill-description hidden';
            skillDesc.textContent = skill.desc || '説明なし';

            skillItem.appendChild(skillBtn);
            skillItem.appendChild(skillDesc);
            skillMenuEl.appendChild(skillItem);

            skillBtn.addEventListener('mouseenter', () => {
                skillDesc.classList.remove('hidden');
            });
            skillBtn.addEventListener('mouseleave', () => {
                skillDesc.classList.add('hidden');
            });
        });
    }
    commandAreaEl.appendChild(skillMenuEl);

    const specialButton = document.createElement('button');
    specialButton.className = 'command-button action-special';
    specialButton.textContent = '必殺技';
    commandAreaEl.appendChild(specialButton);

    const defendButton = document.createElement('button');
    defendButton.className = 'command-button action-defend';
    defendButton.textContent = '防御';
    commandAreaEl.appendChild(defendButton);

    if (specialAbilityConditions[player.originalId] && specialAbilityConditions[player.originalId](player, currentPlayerParty)) {
        specialButton.disabled = false;
    } else {
        specialButton.disabled = true;
    }

    if (isSkillMenuOpen) {
        addCancelButton();
    }
}

function applyPassiveAbilities(combatants) {
    combatants.forEach(c => {
        if (passiveAbilities[c.originalId]) {
            const allies = combatants.filter(ally => ally.partyType === c.partyType);
            const enemies = combatants.filter(enemy => enemy.partyType !== c.partyType);
            passiveAbilities[c.originalId](c, allies, enemies);
        }
    });
}

function processStatusEffects(combatant) {
    let actionSkipped = false;
    if (combatant.effects.stun && combatant.effects.stun.duration > 0) {
        logMessage(`${combatant.name}はスタンしていて動けない！`, 'stun');
        actionSkipped = true;
    } else if (combatant.effects.freeze && combatant.effects.freeze.duration > 0) {
        logMessage(`${combatant.name}は凍結していて動けない！`, 'stun');
        actionSkipped = true;
    } else if (combatant.effects.confusion && combatant.effects.confusion.duration > 0) {
        logMessage(`${combatant.name}は混乱している！`, 'stun');
        actionSkipped = true;
    }
    return actionSkipped;
}

function processEndTurnEffects(combatants) {
    combatants.forEach(c => {
        for (const effectName in c.effects) {
            if (c.effects[effectName].duration !== undefined) {
                c.effects[effectName].duration--;
                if (c.effects[effectName].duration <= 0) {
                    logMessage(`${c.name}の${effectName}が切れた。`, 'status-effect');
                    delete c.effects[effectName];
                }
            }
        }
        if (c.effects.poison && c.effects.poison.duration > 0) {
            const poisonDamage = c.effects.poison.damage;
            c.status.hp = Math.max(0, c.status.hp - poisonDamage);
            logMessage(`${c.name}は毒で${poisonDamage}のダメージを受けた！`, 'damage');
            if (c.status.hp <= 0) {
                logMessage(`${c.name}は毒で倒れた...`, 'fainted');
            }
        }
        if (c.effects.bleed && c.effects.bleed.duration > 0) {
            const bleedDamage = c.effects.bleed.damage;
            c.status.hp = Math.max(0, c.status.hp - bleedDamage);
            logMessage(`${c.name}は出血で${bleedDamage}のダメージを受けた！`, 'damage');
            if (c.status.hp <= 0) {
                logMessage(`${c.name}は出血で倒れた...`, 'fainted');
            }
        }
    });
}

function applyEndTurnPassiveAbilities(combatants) {
    combatants.forEach(c => {
        if (endTurnPassiveAbilities[c.originalId]) {
            const message = endTurnPassiveAbilities[c.originalId](c);
            if (message) logMessage(message, 'status-effect');
        }
    });
}

function executeSkill(actor, skill, skillTargets) {
    const effectFunc = skillEffects[skill.name];
    if (effectFunc) {
        actor.status.mp -= skill.mp;
        effectFunc(actor, skillTargets, calculateDamage, logMessage);
    }
}

function executeSpecial(actor, special, specialTargets) {
    const effectFunc = skillEffects[special.name];
    if (effectFunc) {
        actor.status.mp -= special.mp;
        effectFunc(actor, specialTargets, calculateDamage, logMessage);
    }
}

function isBattleOver() {
    if (!currentPlayerParty || !opponentParty) return false;
    const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
    const aliveEnemies = opponentParty.filter(o => o.status.hp > 0);
    return alivePlayers.length === 0 || aliveEnemies.length === 0;
}

function syncState(myParty, opponentParty) {
    currentPlayerParty = myParty;
    opponentParty = opponentParty;
    updateAllDisplays();
    logMessage('ゲーム状態をホストと同期しました。', 'sync');
}

function syncGameStateClientSide(data) {
    currentPlayerParty = data.opponentParty;
    opponentParty = data.playerParty;
    updateAllDisplays();
    logMessage('ゲーム状態をホストと同期しました。', 'sync');

    const actor = currentPlayerParty.find(c => c.uniqueId === data.actorUniqueId);
    if (actor && resolveClientActionPromise) {
        resolveClientActionPromise();
        resolveClientActionPromise = null;
    }
}

function handleBattleEnd() {
    if (!isBattleOngoing) {
        return;
    }
    if (!currentPlayerParty || currentPlayerParty.length === 0) {
        return;
    }
    if (!opponentParty || opponentParty.length === 0) {
        return;
    }
    const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
    const aliveEnemies = opponentParty.filter(o => o.status.hp > 0);

    if (alivePlayers.length > 0 && aliveEnemies.length > 0) {
        return;
    }

    isBattleOngoing = false;
    resetHighlights();

    const isVictory = alivePlayers.length > 0;
    const survivors = isVictory ? alivePlayers : [];

    if (isVictory) {
        logMessage('戦闘勝利！', 'win');
    } else {
        logMessage('戦闘敗北...', 'lose');
    }

    commandAreaEl.classList.add('hidden');

    setTimeout(() => {
        showBattleEndUI(isVictory, survivors);
    }, 2000);
}

// グローバルアクセス
window.syncState = syncState;
window.syncGameStateClientSide = syncGameStateClientSide;
window.getPlayerParty = () => currentPlayerParty;
window.initializePlayerParty = initializePlayerParty;
window.handleOpponentParty = handleOpponentParty;
window.checkBothPartiesReady = checkBothPartiesReady;
window.startOnlineBattleHostSide = startOnlineBattleHostSide;
window.startOnlineBattleClientSide = startOnlineBattleClientSide;
window.handleActionRequest = window.handleActionRequest;
window.executeAction = executeAction;
window.returnToPartyScreen = returnToPartyScreen;