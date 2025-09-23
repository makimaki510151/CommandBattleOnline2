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
let playerParty = null;     // 自分のパーティー情報
let opponentParty = null;   // 相手のパーティー情報
let currentEnemies = null;  // シングルプレイ時の敵情報
let turnQueue = [];         // 行動順を管理するキュー
let currentTurn = 0;
let isBattleOngoing = false;
let resolveActionPromise = null; // オンライン対戦時の行動待機用

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
    // ユニークIDで要素を検索するように変更
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

        // MPバーはmaxMpが0より大きい場合のみ表示・更新
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
function startBattle(partyMembers) {
    isBattleOngoing = true;
    currentTurn = 0;
    playerParty = partyMembers.map(p => createInitialPartyMember(p, 'player'));
    currentGroupIndex = 0;
    startNextGroup();
}

// オンラインプレイ用：自分のパーティーを準備し、画面に描画
function initializePlayerParty(partyData) {
    // ホストなら 'host'、クライアントなら 'client' のpartyTypeを付与
    playerParty = partyData.map(p => createInitialPartyMember(p, window.isHost() ? 'host' : 'client'));
    renderParty(playerPartyEl, playerParty, false); // 自分のパーティーを描画
    
    // 相手待機中の表示
    enemyPartyEl.innerHTML = '<p class="waiting-message">相手の準備を待っています...</p>';
}

// オンラインプレイ用：相手のパーティー情報を受け取る
function handleOpponentParty(partyData) {
    // 相手のパーティーを初期化（ホストなら 'client'、クライアントなら 'host' のpartyTypeを付与）
    opponentParty = partyData.map(p => createInitialPartyMember(p, window.isHost() ? 'client' : 'host'));
}

// オンラインプレイ用：両者の準備が整ったら戦闘開始
function startOnlineBattle() {
    if (!playerParty || !opponentParty) {
        console.error("両方のパーティーの準備が整っていません。\nplayerParty: ", playerParty, "\nopponentParty: ", opponentParty);
        return;
    }
    isBattleOngoing = true;
    currentTurn = 0;
    
    // 相手のパーティーを画面に描画
    renderParty(enemyPartyEl, opponentParty, true);

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

function executeAction(data) {
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
    }

    updateAllDisplays(); // 全ての表示を更新

    // オンラインモードで相手の行動が完了した場合、待機中のPromiseを解決
    if (window.isOnlineMode() && resolveActionPromise) {
        resolveActionPromise();
        resolveActionPromise = null;
    }

    // 行動が完了したら次のターンへ
    // ただし、オンラインモードでホストでない場合は、ホストからの同期を待つ
    if (!window.isOnlineMode() || window.isHost()) {
        setTimeout(nextTurn, 1000); // 1秒後に次の行動へ
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

    // オンラインモードでホストの場合、行動結果を相手に送信
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
        actualCriticalRate = criticalPassiveFunc(attacker, defender, actualCriticalRate, logMessage);
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
            damage = damagePassiveFunc(attacker, defender, damage, !isMagic, logMessage);
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
        document.addEventListener('click', handleTargetClick); // イベントリスナーをdocumentに追加
    });
}

function selectPlayerTarget() {
    return new Promise(resolve => {
        const players = playerParty.filter(p => p.status.hp > 0);
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
            const target = playerParty.find(p => p.uniqueId === targetUniqueId);
            if (target && target.status.hp > 0) {
                document.removeEventListener('click', handlePlayerClick);
                resetHighlights(); // ハイライトをリセット
                resolve(target);
            }
        };
        document.addEventListener('click', handlePlayerClick); // イベントリスナーをdocumentに追加
    });
}

// --- Skill Execution ---

async function executeSkill(player, skill) {
    const alivePlayers = playerParty.filter(p => p.status.hp > 0);
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
                return false; // ターゲット選択キャンセル
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
            return false; // ターゲット選択キャンセル
        }
    }

    const skillFunc = skillEffects[skill.name];
    if (skillFunc) {
        skillFunc(player, targets, calculateDamage, logMessage);
        return true;
    }

    logMessage('このスキルはまだ実装されていません。');
    // player.status.mp += skill.mp; // 消費したMPを戻す (playerTurnで処理)
    return false;
}

async function executeSpecial(player, special) {
    const alivePlayers = playerParty.filter(p => p.status.hp > 0);
    const aliveEnemies = (window.isOnlineMode() ? opponentParty : currentEnemies).filter(e => e.status.hp > 0);
    const deadPlayers = playerParty.filter(p => p.status.hp <= 0);

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
            return false; // ターゲット選択キャンセル
        }
    }

    const specialFunc = skillEffects[special.name];
    if (specialFunc) {
        specialFunc(player, targets, calculateDamage, logMessage);
        return true;
    }

    logMessage('この必殺技はまだ実装されていません。');
    // player.status.mp += special.mp; // 消費したMPを戻す (playerTurnで処理)
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
    const playersAlive = playerParty.some(p => p.status.hp > 0);
    const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
    const enemiesAlive = enemies ? enemies.some(e => e.status.hp > 0) : false;
    
    // デバッグ用ログ
    console.log('Battle status check:', {
        playersAlive,
        enemiesAlive,
        playerParty: playerParty.map(p => ({ name: p.name, hp: p.status.hp })),
        enemies: enemies ? enemies.map(e => ({ name: e.name, hp: e.status.hp })) : []
    });
    
    return !playersAlive || !enemiesAlive;
}

function handleBattleEnd() {
    console.log('handleBattleEnd called');
    isBattleOngoing = false;
    const playersAlive = playerParty.some(p => p.status.hp > 0);

    if (window.isOnlineMode()) {
        const isWinner = playersAlive;
        console.log('Online battle end:', { isWinner, playersAlive });
        logMessage(isWinner ? '勝利しました！' : '敗北しました...');
        
        // ホストが結果を相手に送信
        if (window.isHost()) {
            console.log('Host sending battle_end message');
            window.sendData({ type: 'battle_end', result: isWinner ? 'win' : 'lose' });
        }
        
        // 勝利・敗北演出を表示
        console.log('Showing battle result');
        showBattleResult(isWinner);
    } else {
        // シングルプレイの場合
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
    logMessage('ゲームオーバー...');
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
        
        onlineScreen.classList.remove('hidden'); // オンライン画面に戻る
        titleScreen.classList.add('hidden'); // タイトル画面は隠す
        
        // 接続をクリーンアップ
        window.cleanupSkyWay(); // main.jsのcleanupSkyWayを呼ぶ
    } else {
        const titleScreen = document.getElementById('title-screen');
        titleScreen.classList.remove('hidden');
    }
    
    // 状態をリセット
    // goButton.disabled = false; // main.jsで管理
    playerParty = null;
    opponentParty = null;
    currentEnemies = null;
    turnQueue = [];
    currentTurn = 0;
    isBattleOngoing = false;
    resolveActionPromise = null;
    uniqueIdCounter = 0;
    messageLogEl.innerHTML = ''; // ログをクリア
}

function resetToPartyScreen() {
    // 画面を切り替え
    battleScreenEl.classList.add('hidden');
    partyScreen.classList.remove('hidden');
    
    // 状態をリセット
    playerParty = null;
    opponentParty = null;
    currentEnemies = null;
    turnQueue = [];
    currentTurn = 0;
    isBattleOngoing = false;
    resolveActionPromise = null;
    uniqueIdCounter = 0;
    messageLogEl.innerHTML = ''; // ログをクリア

    // オンラインモードの場合は、パーティー編成画面のgoButtonを有効化
    if (window.isOnlineMode()) {
        const goButton = document.getElementById('go-button');
        if (goButton) goButton.disabled = false;
    }
}

// --- Online Data Handling ---

// main.jsから呼ばれる、相手からのデータを受信した際の処理
function handleBattleAction(data) {
    switch (data.type) {
        case 'request_action':
            // 相手のキャラクターのターンが来たことを通知
            // この関数は、相手のターンであることを示すために使われる
            // 実際の行動は execute_action で処理される
            const allCombatants = [...playerParty, ...opponentParty];
            const actor = allCombatants.find(c => c.uniqueId === data.actorUniqueId);
            if (actor) {
                logMessage(`${actor.name}のターン！`);
                resetHighlights();
                const actorEl = document.querySelector(`[data-unique-id="${actor.uniqueId}"]`);
                if (actorEl) actorEl.classList.add('active');
            }
            break;
        case 'execute_action':
            // 相手が行動を実行した
            executeAction(data); // 自分の画面にも反映
            // 相手の行動を待っていたPromiseを解決
            if (resolveActionPromise) {
                resolveActionPromise();
                resolveActionPromise = null;
            }
            break;
        case 'action_result':
            // ホストからの行動結果を受信（クライアント側のみ）
            if (!window.isHost()) {
                const { attackerUniqueId, defenderUniqueId, damage, newHp, critical, dodged, specialEffectLog } = data.result;
                const allCombatants = [...playerParty, ...opponentParty];
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
                updateAllDisplays(); // 全ての表示を更新
            }
            break;
        case 'sync_game_state':
            // ホストからのゲーム状態同期を受信（クライアント側のみ）
            if (!window.isHost()) {
                // 状態を上書き
                playerParty = data.playerParty;
                opponentParty = data.opponentParty;
                currentTurn = data.currentTurn;
                // 表示を更新
                updateAllDisplays();
            }
            break;
        case 'log_message':
            // ログメッセージを受信して表示
            logMessage(data.message, data.messageType);
            break;
        case 'battle_end':
            // ホストから戦闘終了通知を受信
            isBattleOngoing = false;
            const isWinner = data.result === 'lose'; // ホストの結果と逆になる
            logMessage(isWinner ? '勝利しました！' : '敗北しました...');
            showBattleResult(isWinner);
            break;
    }
}

// ホストがゲーム状態をクライアントに同期する関数
function syncGameState() {
    if (window.isOnlineMode() && window.isHost()) {
        window.sendData({
            type: 'sync_game_state',
            // クライアント側から見たplayerPartyとopponentPartyになるように入れ替えて送信
            playerParty: opponentParty, 
            opponentParty: playerParty,
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
        memberEl.dataset.uniqueId = member.uniqueId;
        // 後方互換性のため、元のIDも設定
        if (isEnemy) {
            memberEl.dataset.enemyId = member.originalId;
        } else {
            memberEl.dataset.charId = member.originalId;
        }

        const characterImage = member.image ? `<img src="${member.image}" alt="${member.name}" class="character-image">` : '';
        const hpBar = `<div class="hp-bar"><div class="hp-bar-fill" style="width: ${(member.status.hp / member.status.maxHp) * 100}%;"></div></div>`;
        // MPバーはmaxMpが0より大きい場合のみ表示
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

function renderBattle() {
    const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
    renderParty(playerPartyEl, playerParty, false);
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

    // 必殺技ボタンの表示/非表示を制御
    const allies = playerParty.filter(p => p.status.hp > 0);
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
window.startOnlineBattle = startOnlineBattle;
window.getPlayerParty = () => playerParty; // main.jsから参照するため
window.handleRemoteActionRequest = handleBattleAction; // main.jsから相手のアクションを要求された際に呼ぶ
window.executeAction = executeAction; // main.jsから相手のアクションを実行するため
window.handleActionResult = handleBattleAction; // main.jsからホストの行動結果を受信した際に呼ぶ
window.syncGameState = syncGameState; // main.jsからホストがゲーム状態を同期する際に呼ぶ


