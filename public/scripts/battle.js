// battle.js

import { enemyData, enemyGroups } from './enemies.js';
import { passiveAbilities, endTurnPassiveAbilities, specialAbilityConditions, skillEffects, damagePassiveEffects, criticalPassiveEffects } from './character_abilities.js';

// DOM Elements
const enemyPartyEl = document.getElementById('enemy-party');
const playerPartyEl = document.getElementById('player-party');
const messageLogEl = document.getElementById('message-log');
const commandAreaEl = document.getElementById('command-area');
const battleScreenEl = document.getElementById('battle-screen');
const goButton = document.getElementById('go-button'); // main.jsから参照されないが、元のコードにあったため残す
const partyScreen = document.getElementById('party-screen');

// Game State
let playerParty = null;     // 自分のパーティー情報
let opponentParty = null;   // 相手のパーティー情報 (オンライン対戦時)
let currentEnemies = null;  // シングルプレイ時の敵情報
let turnQueue = [];         // 行動順を管理するキュー
let currentTurn = 0;
let isBattleOngoing = false;
let resolveActionPromise = null; // オンライン対戦時の行動待機用

// オンライン対戦用の準備完了フラグ
let myPartyReady = false;
let opponentPartyReady = false;

// ユニークID生成カウンター
let uniqueIdCounter = 0;

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
    updatePartyDisplay(playerPartyEl, playerParty);
    const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
    updatePartyDisplay(enemyPartyEl, enemies);
}

// --- Battle Initialization ---

function createInitialPartyMember(characterData, partyType) {
    const member = deepCopy(characterData);
    member.uniqueId = generateUniqueId();
    member.originalId = member.id; // 元のIDを保存
    member.partyType = partyType; // パーティータイプを追加
    member.effects = {}; // 状態異常やバフ・デバフ
    if (member.originalId === 'char06') { // ゼノス固有の処理
        member.targetMemory = { lastTargetId: null, missed: false };
    }
    return member;
}

// シングルプレイ用バトル開始
function startBattle(partyData) {
    isBattleOngoing = true;
    currentTurn = 0;
    playerParty = partyData.map(p => createInitialPartyMember(p, 'player'));
    currentGroupIndex = 0;
    startNextGroup();
}

// オンラインプレイ用：自分のパーティーを準備し、画面に描画
window.initializePlayerParty = (partyData) => {
    // ホストなら 'host'、クライアントなら 'client' のpartyTypeを付与
    playerParty = partyData.map(p => createInitialPartyMember(p, window.isHost() ? 'host' : 'client'));
    renderParty(playerPartyEl, playerParty, false); // 自分のパーティーを描画

    // 相手待機中の表示
    enemyPartyEl.innerHTML = '<p class="waiting-message">相手の準備を待っています...</p>';

    myPartyReady = true; // 自分のパーティー準備完了
    checkBothPartiesReady();
};

// オンラインプレイ用：相手のパーティー情報を受け取る
window.handleOpponentParty = (partyData) => {
    // 相手のパーティーを初期化（ホストなら 'client'、クライアントなら 'host' のpartyTypeを付与）
    opponentParty = partyData.map(p => createInitialPartyMember(p, window.isHost() ? 'client' : 'host'));
    logMessage('相手のパーティー情報を受信しました！');
    // 相手のパーティーを画面に描画
    renderParty(enemyPartyEl, opponentParty, true);
};

// オンラインプレイ用：相手の準備完了を通知
window.setOpponentPartyReady = () => {
    opponentPartyReady = true;
    checkBothPartiesReady();
};

// 両方のパーティーが準備完了かチェックし、戦闘を開始
function checkBothPartiesReady() {
    if (myPartyReady && opponentPartyReady) {
        logMessage('両者の準備が完了しました。戦闘開始！');
        startOnlineBattle();
    }
}

// オンラインプレイ用：両者の準備が整ったら戦闘開始
function startOnlineBattle() {
    if (!playerParty || !opponentParty) {
        console.error("両方のパーティーの準備が整っていません。\nplayerParty: ", playerParty, "\nopponentParty: ", opponentParty);
        return;
    }
    isBattleOngoing = true;
    currentTurn = 0;

    // 相手のパーティーが既に描画されていることを確認
    if (enemyPartyEl.querySelector('.waiting-message')) {
        renderParty(enemyPartyEl, opponentParty, true);
    }

    // ターン管理キューを初期化して戦闘開始
    initializeTurnQueue();
    nextTurn();
}

// シングルプレイ用：次の敵グループとの戦闘を開始
let currentGroupIndex = 0; // グローバル変数として定義
function startNextGroup() {
    if (currentGroupIndex >= enemyGroups.length) {
        handleGameWin();
        return;
    }
    const group = enemyGroups[currentGroupIndex];
    logMessage(`${group.name}との戦闘！`);
    currentEnemies = group.enemies.map(id => createInitialPartyMember(enemyData.find(e => e.id === id), 'enemy'));
    renderParty(enemyPartyEl, currentEnemies, true);
    initializeTurnQueue();
    nextTurn();
}

// --- Core Battle Logic ---

function initializeTurnQueue() {
    const combatants = window.isOnlineMode()
        ? [...playerParty, ...opponentParty]
        : [...playerParty, ...currentEnemies];

    const aliveCombatants = combatants.filter(c => c.status.hp > 0);

    // パッシブ能力の適用（戦闘開始時のみ）
    if (currentTurn === 0) {
        applyPassiveAbilities(aliveCombatants);
    }

    // 素早さ順にソート（同値の場合はランダム）
    aliveCombatants.sort((a, b) => b.status.spd - a.status.spd || Math.random() - 0.5);
    turnQueue = aliveCombatants;

    const actionOrder = turnQueue.map(c => c.name).join(' → ');
    logMessage(`行動順: ${actionOrder}`);
    if (window.isOnlineMode()) {
        window.sendData({ type: 'log_message', message: `行動順: ${actionOrder}` });
    }
}

async function nextTurn() {
    if (!isBattleOngoing) return; // 戦闘が終了していたら何もしない

    if (turnQueue.length === 0) {
        // 1ターン終了時の処理
        const allCombatants = window.isOnlineMode() ? [...playerParty, ...opponentParty] : [...playerParty, ...currentEnemies];
        processEndTurnEffects(allCombatants.filter(c => c.status.hp > 0)); // 状態異常の持続時間減少など
        applyEndTurnPassiveAbilities(allCombatants.filter(c => c.status.hp > 0)); // ターン終了時パッシブ
        updateAllDisplays(); // HP/MPバーなどを更新

        if (isBattleOver()) { // ターン終了後に勝敗判定
            handleBattleEnd();
            return;
        }

        currentTurn++;
        const turnStartMessage = `=== ターン ${currentTurn + 1} 開始 ===`;
        logMessage(turnStartMessage, 'turn-start');
        if (window.isOnlineMode()) {
            window.sendData({ type: 'log_message', message: turnStartMessage, messageType: 'turn-start' });
        }

        initializeTurnQueue(); // 次のターンの行動順を再計算
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
        nextTurn(); // 次のターンへ
        return;
    }

    const combatant = turnQueue.shift(); // 行動するキャラクターをキューから取り出す
    if (combatant.status.hp <= 0) {
        nextTurn(); // 死んでいたら次のキャラクターへ
        return;
    }

    resetHighlights(); // 全てのハイライトをリセット
    const combatantEl = document.querySelector(`[data-unique-id="${combatant.uniqueId}"]`);
    if (combatantEl) combatantEl.classList.add('active'); // 行動中のキャラクターをハイライト

    const actionSkipped = processStatusEffects(combatant); // 状態異常による行動スキップ判定
    if (actionSkipped) {
        updateAllDisplays();
        await new Promise(resolve => setTimeout(resolve, 1000));
        nextTurn();
        return;
    }

    // 行動するキャラクターが自分の操作するキャラクターか判定
    const isMyCharacter = combatant.partyType === (window.isHost() ? 'host' : 'client');

    if (isMyCharacter) {
        await playerTurn(combatant); // 自分のキャラクターのターン
    } else {
        if (window.isOnlineMode()) {
            // オンライン対戦で相手のキャラクターの場合
            logMessage(`${combatant.name}の行動を待っています...`);
            // 相手からの行動データ受信を待つ
            // resolveActionPromise が解決されるまでここで待機
            await new Promise(resolve => { resolveActionPromise = resolve; });
        } else {
            // シングルプレイで敵のキャラクターの場合
            await enemyTurn(combatant); // 敵のターン
        }
    }
    // 行動が完了したら次のターンへ
    // executeAction内でnextTurnを呼ぶように変更したため、ここでは不要
}

// --- Passive Abilities ---

function applyPassiveAbilities(combatants) {
    const playerCombatants = combatants.filter(c => c.partyType === 'player' || c.partyType === 'host' || c.partyType === 'client');
    const enemyCombatants = combatants.filter(c => c.partyType === 'enemy' || c.partyType === 'host' || c.partyType === 'client'); // 敵と相手プレイヤーを区別

    combatants.forEach(combatant => {
        const passiveFunc = passiveAbilities[combatant.originalId];
        if (passiveFunc) {
            // パッシブ能力の引数を調整
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
                executeAction(actionData); // 自分自身でもアクションを実行
                resolve(); // playerTurnのPromiseを解決
            }
        };
        commandAreaEl.addEventListener('click', handleCommand); // コマンドメニューのクリックイベントリスナー
    });
}

async function enemyTurn(enemy) {
    logMessage(`${enemy.name}のターン！`);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 敵の行動に少し間を置く

    const alivePlayers = playerParty.filter(p => p.status.hp > 0);
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

window.executeAction = (data) => {
    const allCombatants = window.isOnlineMode()
        ? [...playerParty, ...opponentParty]
        : [...playerParty, ...currentEnemies];

    // ユニークIDで行動者と対象を検索
    const actor = allCombatants.find(c => c.uniqueId === data.actorUniqueId);
    const target = data.targetUniqueId ? allCombatants.find(c => c.uniqueId === data.targetUniqueId) : null;

    if (!actor) {
        console.error('Actor not found with uniqueId:', data.actorUniqueId);
        logMessage(`エラー: 行動者が見つかりません。`, 'error');
        // オンラインモードで相手の行動が不明な場合、ターンを進めるためにresolveActionPromiseを呼ぶ
        if (window.isOnlineMode() && resolveActionPromise) {
            resolveActionPromise();
            resolveActionPromise = null;
        }
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
            // スキル実行ロジック (ここではログ表示のみ、実際の効果はexecuteSkillで処理済み)
            logMessage(`${actor.name}は${data.skillName}を使った！`);
            // オンラインモードの場合、相手側ではスキル効果を再計算する必要があるかもしれないが、
            // 現状はホストが状態を同期するので不要
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

    // オンラインモードで相手の行動が完了した場合、待機Promiseを解決してターンを進める
    if (window.isOnlineMode() && resolveActionPromise) {
        resolveActionPromise();
        resolveActionPromise = null;
    }

    // 次のターンへ
    nextTurn();
};

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
        return await effectFunc(actor, playerParty, currentEnemies, opponentParty, selectTarget, logMessage);
    }
    console.warn(`Skill effect not found for ${skill.id}`);
    return false;
}

async function executeSpecial(actor, special) {
    const effectFunc = skillEffects[special.id]; // 必殺技もスキル効果として扱う
    if (effectFunc) {
        return await effectFunc(actor, playerParty, currentEnemies, opponentParty, selectTarget, logMessage);
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

        // ... 既存のコード ...

        // ★★★ ここを修正 ★★★
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
    const alivePlayers = playerParty.filter(p => p.status.hp > 0);
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
    const alivePlayers = playerParty.filter(p => p.status.hp > 0);
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

// --- Global Access for main.js ---
window.getPlayerParty = () => playerParty;
window.startOnlineBattle = startOnlineBattle;
window.startBattle = startBattle;
window.initializePlayerParty = initializePlayerParty;
window.handleOpponentParty = handleOpponentParty;
window.setOpponentPartyReady = setOpponentPartyReady;
window.executeAction = executeAction;
window.handleBattleAction = (data) => {
    // オンライン同期用のアクションハンドラ
    // 例: 相手からゲームの状態が送られてきた場合
    if (data.type === 'sync_game_state') {
        playerParty = data.playerParty;
        opponentParty = data.opponentParty;
        currentTurn = data.currentTurn;
        turnQueue = data.turnQueue;
        isBattleOngoing = data.isBattleOngoing;
        updateAllDisplays();
        logMessage('ゲーム状態を同期しました。');
        // ターンが進行中であればnextTurnを再開
        if (isBattleOngoing && turnQueue.length > 0) {
            nextTurn();
        }
    } else if (data.type === 'battle_end') {
        // 戦闘終了の同期
        handleBattleEnd();
    }
};

// --- Passive Effect Functions (from character_abilities.js) ---

function applyDamagePassiveEffects(attacker, target, damage) {
    // 例: 特定のキャラクターが特定の相手に与えるダメージを増減させる
    if (damagePassiveEffects[attacker.originalId]) {
        damage = damagePassiveEffects[attacker.originalId](attacker, target, damage);
    }
    return damage;
}

// --- Export for testing (if needed) ---
// export { startBattle, initializePlayerParty, handleOpponentParty, startOnlineBattle, getPlayerParty };


