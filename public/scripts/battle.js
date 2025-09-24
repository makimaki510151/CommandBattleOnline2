// battle.js (修正版)

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

// --- Utility Functions ---

function generateUniqueId() {
    return `unique_${Date.now()}_${uniqueIdCounter++}`;
}

function logMessage(message, type = '') {
    if (window.logMessage) {
        window.logMessage(message, type);
    }
}

function deepCopy(obj) {
    if (obj === undefined) {
        return undefined;
    }
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
                    resetHighlights();
                    const combatantEl = document.querySelector(`[data-unique-id="${combatant.uniqueId}"]`);
                    if (combatantEl) {
                        combatantEl.classList.add('active');
                    }
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
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } else {
        logMessage("ホストからの行動を待っています...");
    }
}

// ホスト側のプレイヤーの行動を処理する関数
async function playerTurn(actor) {
    resetHighlights();
    const combatantEl = document.querySelector(`[data-unique-id="${actor.uniqueId}"]`);
    if (combatantEl) {
        combatantEl.classList.add('active');
    }
    logMessage(`${actor.name}のターン！`, 'character-turn');
    commandAreaEl.classList.remove('hidden');
    updateCommandMenu(actor);

    return new Promise(resolve => {
        const handleCommand = async (event) => {
            const target = event.target;
            let actionData = null;
            let targetUniqueId = null;

            if (target.matches('.action-attack')) {
                logMessage('攻撃対象を選んでください。');
                const targetInfo = await selectTarget();
                if (targetInfo) {
                    targetUniqueId = targetInfo.target.uniqueId;
                    actionData = { action: 'attack', actorUniqueId: actor.uniqueId, targetUniqueId: targetUniqueId };
                }
            } else if (target.matches('.action-defend')) {
                actionData = { action: 'defend', actorUniqueId: actor.uniqueId };
            } else if (target.matches('.action-skill')) {
                const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
                if (skillMenuEl) {
                    skillMenuEl.classList.toggle('hidden');
                }
                return;
            } else if (target.matches('.skill-button')) {
                const skillName = target.textContent;
                const skill = actor.active.find(s => s.name === skillName);
                if (skill) {
                    let mpCost = skill.mp;
                    if (actor.status.mp < mpCost) {
                        logMessage(`MPが足りません！`);
                        return;
                    }
                    actionData = { action: 'skill', actorUniqueId: actor.uniqueId, skillId: skill.id };
                }
            } else if (target.matches('.action-special')) {
                const special = actor.special;
                if (special) {
                    let mpCost = special.mp;
                    if (actor.status.mp < mpCost) {
                        logMessage(`MPが足りません！`);
                        return;
                    }
                    actionData = { action: 'special', actorUniqueId: actor.uniqueId, specialId: special.id };
                }
            }

            if (actionData) {
                commandAreaEl.removeEventListener('click', handleCommand);
                commandAreaEl.classList.add('hidden');
                executeAction(actionData);
                resolve();
            }
        };
        commandAreaEl.addEventListener('click', handleCommand);
    });
}

// クライアントからのアクション実行要求
window.handleActionRequest = async (data) => {
    const actor = currentPlayerParty.find(c => c.uniqueId === data.actorUniqueId);
    if (!actor) return;

    resetHighlights();
    const combatantEl = document.querySelector(`[data-unique-id="${actor.uniqueId}"]`);
    if (combatantEl) {
        combatantEl.classList.add('active');
    }
    logMessage(`${actor.name}のターン！`, 'character-turn');

    commandAreaEl.classList.remove('hidden');
    updateCommandMenu(actor);

    await new Promise(resolve => {
        const handleCommand = async (event) => {
            const target = event.target;
            let actionData = null;
            let targetUniqueId = null;

            if (target.matches('.action-attack')) {
                logMessage('攻撃対象を選んでください。');
                const targetInfo = await selectTarget();
                if (targetInfo) {
                    targetUniqueId = targetInfo.target.uniqueId;
                    actionData = { action: 'attack', targetUniqueId: targetUniqueId };
                }
            } else if (target.matches('.action-defend')) {
                actionData = { action: 'defend' };
            } else if (target.matches('.action-skill')) {
                const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
                if (skillMenuEl) {
                    skillMenuEl.classList.toggle('hidden');
                }
                return;
            } else if (target.matches('.skill-button')) {
                const skillName = target.textContent;
                const skill = actor.active.find(s => s.name === skillName);
                if (skill) {
                    let mpCost = skill.mp;
                    if (actor.status.mp < mpCost) {
                        logMessage(`MPが足りません！`);
                        return;
                    }
                    actionData = { action: 'skill', skillId: skill.id };
                }
            } else if (target.matches('.action-special')) {
                const special = actor.special;
                if (special) {
                    let mpCost = special.mp;
                    if (actor.status.mp < mpCost) {
                        logMessage(`MPが足りません！`);
                        return;
                    }
                    actionData = { action: 'special', specialId: special.id };
                }
            }

            if (actionData) {
                commandAreaEl.removeEventListener('click', handleCommand);
                commandAreaEl.classList.add('hidden');
                // クライアント側は自分のユニークIDを付加して送信
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
        // オンラインモードでは、自分のパーティーと相手のパーティーを使用
        allCombatants = [...currentPlayerParty, ...opponentParty];
    } else {
        // 非オンラインモードでは、自分のパーティーと敵のグループを使用
        allCombatants = [...currentPlayerParty, ...currentEnemies];
    }

    const actor = allCombatants.find(c => c.uniqueId === data.actorUniqueId);
    if (!actor) {
        // ログにデバッグ情報を追加すると原因特定に役立ちます
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
            const skill = actor.active.find(s => s.id === data.skillId);
            if (skill) {
                executeSkill(actor, skill);
            }
            break;
        case 'special':
            const special = actor.special;
            if (special && special.id === data.specialId) {
                executeSpecial(actor, special);
            }
            break;
    }

    updateAllDisplays();

    // ホストとしてクライアントのアクション実行を受け取った場合
    if (window.isOnlineMode() && window.isHost() && data.actorUniqueId) {
        // クライアントのキャラクターのターンであることを確認
        const isClientCharacter = opponentParty.some(c => c.uniqueId === data.actorUniqueId);
        if (isClientCharacter && resolveClientActionPromise) {
            resolveClientActionPromise();
            resolveClientActionPromise = null;
        }
    }

    // ホストのキャラクターのアクション実行後、ホスト側の待機Promiseを解決
    if (window.isOnlineMode() && window.isHost() && data.actorUniqueId) {
        const isHostCharacter = currentPlayerParty.some(c => c.uniqueId === data.actorUniqueId);
        if (isHostCharacter) {
            // ... (元々のロジックをここに配置)
        }
    }

};

function calculateDamage(attacker, target, isMagic = false) {
    let attackPower;
    let defensePower;
    let damageMultiplier = 1;
    let isCritical = false;
    let isDodged = false;

    // 攻撃力と防御力の決定
    if (isMagic) {
        attackPower = attacker.status.mag;
        defensePower = target.status.mdf;
    } else {
        attackPower = attacker.status.atk;
        defensePower = target.status.def;
    }

    // 回避判定
    const dodgeRate = target.status.dodgeRate || 0;
    if (Math.random() < dodgeRate) {
        isDodged = true;
        return { damage: 0, critical: false, dodged: true };
    }

    // クリティカル判定
    let criticalRate = attacker.status.criticalRate;
    if (criticalPassiveEffects[attacker.originalId]) {
        criticalRate = criticalPassiveEffects[attacker.originalId](attacker, target, criticalRate);
    }

    if (Math.random() < criticalRate) {
        isCritical = true;
        damageMultiplier *= attacker.status.criticalMultiplier;
    }

    // ダメージ計算
    let damage = Math.max(1, Math.floor((attackPower * damageMultiplier) - (defensePower / 2)));

    // パッシブ効果によるダメージ調整
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

function selectTarget() {
    return new Promise(resolve => {
        const targets = window.isOnlineMode() ? (window.isHost() ? opponentParty : currentPlayerParty) : currentEnemies;
        if (!targets) {
            resolve(null);
            return;
        }

        const aliveTargets = targets.filter(e => e.status.hp > 0);
        if (aliveTargets.length === 0) {
            resolve(null);
            return;
        }
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
    commandAreaEl.innerHTML = `
        <button class="action-attack">攻撃</button>
        <button class="action-defend">防御</button>
        <button class="action-skill">スキル</button>
        <button class="action-special">必殺技</button>
        <div class="skill-menu hidden">
            ${player.active.map(skill => `<button class="skill-button">${skill.name}</button>`).join('')}
        </div>
    `;
    const specialButton = commandAreaEl.querySelector('.action-special');
    if (player.special) {
        specialButton.classList.remove('hidden');
    } else {
        specialButton.classList.add('hidden');
    }
}

function resetHighlights() {
    document.querySelectorAll('.character-card').forEach(card => {
        card.classList.remove('active');
    });
}

function applyPassiveAbilities(combatants) {
    combatants.forEach(c => {
        if (c.passive && c.passive.id && passiveAbilities[c.passive.id]) {
            passiveAbilities[c.passive.id](c, combatants, logMessage);
        }
    });
}

function processStatusEffects(combatant) {
    let actionSkipped = false;
    if (combatant.effects.stun && combatant.effects.stun.duration > 0) {
        logMessage(`${combatant.name}はスタンしていて動けない！`, 'stun');
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
                    logMessage(`${c.name}の${effectName}が切れた。`);
                    delete c.effects[effectName];
                }
            }
        }
        if (c.effects.poison && c.effects.poison.duration > 0) {
            const poisonDamage = Math.floor(c.status.maxHp * 0.05);
            c.status.hp -= poisonDamage;
            logMessage(`${c.name}は毒で${poisonDamage}のダメージを受けた！`, 'damage');
            if (c.status.hp <= 0) {
                c.status.hp = 0;
                logMessage(`${c.name}は毒で倒れた...`, 'fainted');
            }
        }
    });
}

function applyEndTurnPassiveAbilities(combatants) {
    combatants.forEach(c => {
        if (c.passive && c.passive.id && endTurnPassiveAbilities[c.passive.id]) {
            endTurnPassiveAbilities[c.passive.id](c, combatants, logMessage);
        }
    });
}

function executeSkill(actor, skill) {
    const effectFunc = skillEffects[skill.id];
    if (effectFunc) {
        const targets = window.isOnlineMode() ? opponentParty : currentEnemies;
        return effectFunc(actor, targets, calculateDamage, logMessage);
    }
    return false;
}

function executeSpecial(actor, special) {
    const effectFunc = skillEffects[special.id];
    if (effectFunc) {
        const targets = window.isOnlineMode() ? opponentParty : currentEnemies;
        return effectFunc(actor, targets, calculateDamage, logMessage);
    }
    return false;
}

function applyDamagePassiveEffects(attacker, target, damage) {
    if (damagePassiveEffects[attacker.originalId]) {
        damage = damagePassiveEffects[attacker.originalId](attacker, target, damage);
    }
    return damage;
}

function isBattleOver() {
    const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
    const aliveEnemies = opponentParty.filter(o => o.status.hp > 0);
    return alivePlayers.length === 0 || aliveEnemies.length === 0;
}

// ゲーム状態を同期する新しい関数
function syncState(myParty, opponentParty) {
    currentPlayerParty = myParty;
    opponentParty = opponentParty;
    updateAllDisplays();
    logMessage('ゲーム状態をホストと同期しました。', 'sync');
}

function syncGameStateClientSide(data) {
    // ホストから送られてきたデータを使用して、自分のパーティーと相手のパーティーを更新
    // ホストのplayerPartyは、クライアントのopponentParty
    // ホストのopponentPartyは、クライアントのplayerParty
    currentPlayerParty = data.opponentParty;
    opponentParty = data.playerParty;

    // 表示を更新
    updateAllDisplays();
    logMessage('ゲーム状態をホストと同期しました。', 'sync');

    // クライアント側のターンが来た場合に待機Promiseを解決
    const actor = currentPlayerParty.find(c => c.uniqueId === data.actorUniqueId);
    if (actor && resolveClientActionPromise) {
        resolveClientActionPromise();
        resolveClientActionPromise = null;
    }
}

function handleBattleEnd() {
    isBattleOngoing = false;
    const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
    if (alivePlayers.length === 0) {
        logMessage('戦闘敗北...', 'lose');
    } else {
        logMessage('戦闘勝利！', 'win');
    }
    commandAreaEl.classList.add('hidden');
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
