// battle.js (修正版)

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
        updateAllDisplays();

        // ターン終了後に再度勝敗判定（自己修復などで状況が変わる可能性があるため）
        if (isBattleOver()) {
            handleBattleEnd();
            break;
        }

        currentTurn++;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// オンライン対戦用の行動待機
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
            passiveFunc(combatant, allies, enemies, logMessage);
        }
    });
}

function applyEndTurnPassiveAbilities(combatants) {
    combatants.forEach(combatant => {
        // 生存しているキャラクターのみにターン終了時パッシブを適用
        if (combatant.status.hp > 0) {
            const endTurnPassiveFunc = endTurnPassiveAbilities[combatant.originalId];
            if (endTurnPassiveFunc) {
                const message = endTurnPassiveFunc(combatant, logMessage);
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
                return; // スキルメニュー表示中はアクションを確定しない
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
                    } else {
                        player.status.mp += mpCost; // スキル実行失敗時はMPを戻す
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
                    } else {
                        player.status.mp += mpCost; // 必殺技実行失敗時はMPを戻す
                    }
                }
            } else if (target.matches('.action-defend')) {
                logMessage(`${player.name}は防御した。`);
                player.isDefending = true;
                actionData = { action: 'defend', actorUniqueId: player.uniqueId };
            }

            if (actionData) {
                commandAreaEl.removeEventListener('click', handleCommand); // イベントリスナーを削除
                commandAreaEl.classList.add('hidden'); // コマンドメニューを隠す

                // オンラインモードの場合、相手にアクションを送信
                if (window.isOnlineMode()) {
                    window.sendData({ type: 'execute_action', ...actionData });
                }

                // 自分自身でもアクションを実行
                executeAction(actionData);
                resolve(); // playerTurnのPromiseを解決
            }
        };
        commandAreaEl.addEventListener('click', handleCommand); // コマンドメニューのクリックイベントリスナー
    });
}

async function enemyTurn(enemy) {
    logMessage(`${enemy.name}のターン！`);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 敵の行動に少し間を置く

    const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
    if (alivePlayers.length > 0) {
        const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)]; // ランダムなプレイヤーをターゲット
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

    const actor = allCombatants.find(c => c.uniqueId === data.actorUniqueId);
    if (!actor) {
        console.warn('Actor not found:', data.actorUniqueId);
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
            logMessage(`${actor.name}は防御した。`);
            actor.isDefending = true;
            break;
        case 'skill':
            // スキル実行ロジック (ここではログ表示のみ、実際の効果はexecuteSkillで処理済み)
            logMessage(`${actor.name}は${data.skillName}を使った！`);
            break;
        case 'special':
            // 必殺技実行ロジック (ここではログ表示のみ、実際の効果はexecuteSpecialで処理済み)
            logMessage(`${actor.name}は${data.specialName}を使った！`);
            break;
        default:
            console.warn('Unknown action type:', data.action);
            break;
    }

    updateAllDisplays();

    // オンラインモードで相手の行動が完了した場合、待機Promiseを解決
    if (window.isOnlineMode() && resolveActionPromise) {
        resolveActionPromise();
        resolveActionPromise = null;
    }
}

// --- Attack and Damage Calculation ---

function performAttack(attacker, target) {
    logMessage(`${attacker.name}の攻撃！`);

    // 攻撃力と防御力の計算
    let attackPower = attacker.status.atk;
    let defensePower = target.status.def;

    // 防御状態の処理
    if (target.isDefending) {
        defensePower *= 2; // 防御中は防御力2倍
        target.isDefending = false; // 防御状態を解除
        logMessage(`${target.name}は防御している！`, 'defend');
    }

    // ダメージ計算
    let damage = Math.max(0, attackPower - defensePower);

    // 会心の一撃判定
    let isCritical = false;
    if (Math.random() < (attacker.status.critRate || 0.1)) { // デフォルト会心率10%
        isCritical = true;
        damage = Math.floor(damage * (attacker.status.critDamage || 1.5)); // デフォルト会心ダメージ1.5倍
        logMessage('会心の一撃！', 'critical');
    }

    // ダメージパッシブ効果
    damage = applyDamagePassiveEffects(attacker, target, damage);

    // 会心パッシブ効果
    if (isCritical) {
        criticalPassiveEffects(attacker, target, logMessage);
    }

    target.status.hp -= damage;
    logMessage(`${target.name}に${damage}のダメージ！`, 'damage');

    if (target.status.hp <= 0) {
        target.status.hp = 0;
        logMessage(`${target.name}は倒れた...`, 'fainted');
    }
    updateAllDisplays();
}

// --- Skill and Special Abilities ---

async function executeSkill(actor, skill) {
    const effectFunc = skillEffects[skill.id];
    if (effectFunc) {
        return await effectFunc(actor, currentPlayerParty, currentEnemies, opponentParty, selectTarget, logMessage);
    }
    console.warn(`Skill effect not found for ${skill.id}`);
    return false;
}

async function executeSpecial(actor, special) {
    const effectFunc = skillEffects[special.id]; // 必殺技もスキル効果として扱う
    if (effectFunc) {
        return await effectFunc(actor, currentPlayerParty, currentEnemies, opponentParty, selectTarget, logMessage);
    }
    console.warn(`Special effect not found for ${special.id}`);
    return false;
}

// --- Target Selection ---

function selectTarget() {
    return new Promise(resolve => {
        const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
        const aliveTargets = enemies.filter(e => e.status.hp > 0);

        if (aliveTargets.length === 0) {
            resolve(null); // ターゲットがいない場合
            return;
        }

        // ターゲット選択UIの表示
        const targetSelectionOverlay = document.createElement('div');
        targetSelectionOverlay.id = 'target-selection-overlay';
        targetSelectionOverlay.innerHTML = '<p>ターゲットを選択してください</p>';
        battleScreenEl.appendChild(targetSelectionOverlay);

        const clickHandler = (event) => {
            const targetEl = event.target.closest('.character-card');
            if (targetEl) {
                const uniqueId = targetEl.dataset.uniqueId;
                const selectedTarget = aliveTargets.find(t => t.uniqueId === uniqueId);
                if (selectedTarget) {
                    targetSelectionOverlay.remove();
                    enemyPartyEl.removeEventListener('click', clickHandler);
                    resolve({ target: selectedTarget, element: targetEl });
                }
            }
        };
        enemyPartyEl.addEventListener('click', clickHandler);
    });
}

// --- UI Rendering ---

function renderParty(partyEl, partyData, isEnemy) {
    partyEl.innerHTML = '';
    if (!partyData) return;

    partyData.forEach(member => {
        const memberEl = document.createElement('div');
        memberEl.classList.add('character-card', isEnemy ? 'enemy-character' : 'player-character');
        memberEl.dataset.uniqueId = member.uniqueId;

        // 受信したデータ (images/char01.png) をそのまま使用
        const characterImage = member.image ? `<img src="${member.image}" alt="${member.name}" class="character-image" onerror="this.onerror=null;this.src='images/placeholder.png';">` : '';

        const hpBar = `<div class="hp-bar"><div class="hp-bar-fill" style="width: ${(member.status.hp / member.status.maxHp) * 100}%;"></div></div>`;
        const mpBar = (isEnemy || member.status.maxMp === 0) ? '' : `<div class="mp-bar"><div class="mp-bar-fill" style="width: ${(member.status.mp / member.status.maxMp) * 100}%;"></div></div>`;
        const mpText = (isEnemy || member.status.maxMp === 0) ? '' : `<p class="mp-text-line">MP: <span class="mp-text">${member.status.mp}/${member.status.maxMp}</span></p>`;

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

function updateCommandMenu(player) {
    commandAreaEl.innerHTML = `
        <button class="action-attack">攻撃</button>
        <button class="action-skill">スキル</button>
        <button class="action-special">必殺技</button>
        <button class="action-defend">防御</button>
        <div class="skill-menu hidden">
            ${player.active.map(skill => `<button class="skill-button">${skill.name}</button>`).join('')}
        </div>
    `;
}

function resetHighlights() {
    document.querySelectorAll('.character-card').forEach(card => {
        card.classList.remove('active');
    });
}

// --- Status Effects ---

function processStatusEffects(combatant) {
    let actionSkipped = false;
    if (combatant.effects.stun && combatant.effects.stun.duration > 0) {
        logMessage(`${combatant.name}はスタンしていて動けない！`, 'stun');
        actionSkipped = true;
    }
    // 他の状態異常もここに追加
    return actionSkipped;
}

function processEndTurnEffects(combatants) {
    combatants.forEach(c => {
        // 状態異常の持続ターンを減らす
        for (const effectName in c.effects) {
            if (c.effects[effectName].duration !== undefined) {
                c.effects[effectName].duration--;
                if (c.effects[effectName].duration <= 0) {
                    logMessage(`${c.name}の${effectName}が切れた。`);
                    delete c.effects[effectName];
                }
            }
        }

        // 毒などの継続ダメージ
        if (c.effects.poison && c.effects.poison.duration > 0) {
            const poisonDamage = Math.floor(c.status.maxHp * 0.05); // 最大HPの5%ダメージ
            c.status.hp -= poisonDamage;
            logMessage(`${c.name}は毒で${poisonDamage}のダメージを受けた！`, 'damage');
            if (c.status.hp <= 0) {
                c.status.hp = 0;
                logMessage(`${c.name}は毒で倒れた...`, 'fainted');
            }
        }
    });
}

// --- Battle End Conditions ---

function isBattleOver() {
    const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
    const aliveEnemies = window.isOnlineMode() ? opponentParty.filter(o => o.status.hp > 0) : currentEnemies.filter(e => e.status.hp > 0);

    if (alivePlayers.length === 0) {
        return true; // プレイヤー全滅
    }
    if (aliveEnemies.length === 0) {
        return true; // 敵全滅
    }
    return false;
}

function handleBattleEnd() {
    isBattleOngoing = false;
    const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
    const aliveEnemies = window.isOnlineMode() ? opponentParty.filter(o => o.status.hp > 0) : currentEnemies.filter(e => e.status.hp > 0);

    if (alivePlayers.length === 0) {
        handleGameLose();
    } else if (aliveEnemies.length === 0) {
        if (window.isOnlineMode()) {
            handleGameWin(); // オンライン対戦では相手全滅で勝利
        } else {
            // シングルプレイでは次のグループへ
            currentGroupIndex++;
            if (currentGroupIndex < enemyGroups.length) {
                logMessage('次の敵グループへ！');
                startNextGroup();
            } else {
                handleGameWin();
            }
        }
    }
}

function handleGameWin() {
    logMessage('戦闘勝利！', 'win');
    commandAreaEl.classList.add('hidden');
    // 必要に応じてリザルト画面などへ遷移
}

function handleGameLose() {
    logMessage('戦闘敗北...', 'lose');
    commandAreaEl.classList.add('hidden');
    // 必要に応じてゲームオーバー画面などへ遷移
}

// --- Game State Synchronization ---

function syncGameState() {
    if (window.isOnlineMode()) {
        window.sendData({
            type: 'sync_game_state',
            playerParty: currentPlayerParty,
            opponentParty: opponentParty,
            currentTurn: currentTurn,
            isBattleOngoing: isBattleOngoing
        });
    }
}

// --- Passive Effect Functions (from character_abilities.js) ---

function applyDamagePassiveEffects(attacker, target, damage) {
    // 例: 特定のキャラクターが特定の相手に与えるダメージを増減させる
    if (damagePassiveEffects[attacker.originalId]) {
        damage = damagePassiveEffects[attacker.originalId](attacker, target, damage);
    }
    return damage;
}

// --- Global Access for main.js ---

window.getPlayerParty = () => currentPlayerParty;
window.startBattle = startBattle;
window.initializePlayerParty = initializePlayerParty;
window.handleOpponentParty = handleOpponentParty;
window.startOnlineBattle = startOnlineBattle;
window.executeAction = executeAction;

// オンライン同期用のアクションハンドラ
window.handleBattleAction = (data) => {
    if (data.type === 'sync_game_state') {
        currentPlayerParty = data.playerParty;
        opponentParty = data.opponentParty;
        currentTurn = data.currentTurn;
        isBattleOngoing = data.isBattleOngoing;
        updateAllDisplays();
        logMessage('ゲーム状態を同期しました。');
    } else if (data.type === 'battle_end') {
        handleBattleEnd();
    } else if (data.type === 'start_battle') {
        startBattleClientSide();
    }
};
