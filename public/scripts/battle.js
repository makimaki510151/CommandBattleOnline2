// battle.js (オンライン同期強化版・再修正)

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

let resolveActionPromise = null;

// --- Utility Functions ---

function generateUniqueId() {
    return `unique_${Date.now()}_${uniqueIdCounter++}`;
}

function logMessage(message, type = '') {
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
    await startNextGroup();
}

function initializePlayerParty(partyData) {
    console.log('✅ initializePlayerParty: 自分のパーティーを初期化します。');
    const partyType = window.isHost() ? 'host' : 'client';
    currentPlayerParty = initializeParty(partyData, partyType);
    renderParty(playerPartyEl, currentPlayerParty, false);
    if (window.isOnlineMode() && !window.isHost()) {
        enemyPartyEl.innerHTML = '<p class="waiting-message">相手の準備を待っています...</p>';
    }
    myPartyReady = true;
    logMessage('自分のパーティーの準備が完了しました。');
    console.log('myPartyReady:', myPartyReady);
    checkBothPartiesReady();
}

function handleOpponentParty(partyData) {
    console.log('✅ handleOpponentParty: 相手のパーティー情報を受信しました。');
    if (!partyData || !Array.isArray(partyData) || partyData.length === 0) {
        console.error('受信した相手のパーティーデータが無効です。', partyData);
        logMessage('エラー: 相手のパーティー情報の受信に失敗しました。', 'error');
        return;
    }
    const partyType = window.isHost() ? 'client' : 'host';
    opponentParty = partyData.map((p, index) => {
        const member = deepCopy(p);
        if (!member.uniqueId) {
            member.uniqueId = generateUniqueId();
        }
        member.originalId = member.id || member.originalId;
        member.partyType = partyType;
        member.partyIndex = index;
        member.effects = member.effects || {};
        if (member.originalId === 'char06') {
            member.targetMemory = member.targetMemory || { lastTargetId: null, missed: false };
        }
        return member;
    });
    logMessage('対戦相手のパーティー情報を受信しました！');
    renderParty(enemyPartyEl, opponentParty, true);
    opponentPartyReady = true;
    console.log('opponentPartyReady:', opponentPartyReady);
    checkBothPartiesReady();
}

function checkBothPartiesReady() {
    console.log('✅ checkBothPartiesReady: 自分の準備:', myPartyReady, '相手の準備:', opponentPartyReady);
    if (myPartyReady && opponentPartyReady) {
        logMessage('両者の準備が完了しました。');
        if (window.isOnlineMode()) {
            if (window.isHost()) {
                logMessage('ホストとして戦闘開始処理を実行。');
                window.sendData('start_battle', { playerParty: currentPlayerParty, opponentParty: opponentParty });
                startOnlineBattle();
            } else {
                logMessage('クライアントとしてホストの戦闘開始を待機。');
            }
        }
    }
}

async function startOnlineBattle() {
    isBattleOngoing = true;
    currentTurn = 0;
    logMessage("戦闘開始！");
    await battleLoop();
}

function startBattleClientSide(initialState) {
    if (isBattleOngoing) return;
    logMessage('ホストが戦闘を開始しました。');
    isBattleOngoing = true;
    currentTurn = initialState.currentTurn || 0;
    
    // パーティー情報を初期状態から再構築
    currentPlayerParty = initialState.playerParty.map(p => {
        const member = deepCopy(p);
        member.partyType = window.isHost() ? 'host' : 'client';
        return member;
    });
    opponentParty = initialState.opponentParty.map(p => {
        const member = deepCopy(p);
        member.partyType = window.isHost() ? 'client' : 'host';
        return member;
    });

    renderParty(playerPartyEl, currentPlayerParty, false);
    renderParty(enemyPartyEl, opponentParty, true);

    battleLoop();
}

function startNextGroup() {
    // 省略：シングルプレイ用
}

// --- Core Battle Logic ---

async function battleLoop() {
    if (window.isOnlineMode() && !window.isHost()) {
        logMessage("ホストからの行動を待っています...");
        return;
    }

    while (isBattleOngoing) {
        if (isBattleOver()) {
            handleBattleEnd();
            break;
        }

        const turnStartMessage = `=== ターン ${currentTurn + 1} 開始 ===`;
        logMessage(turnStartMessage, 'turn-start');

        const combatants = window.isOnlineMode()
            ? [...currentPlayerParty, ...opponentParty]
            : [...currentPlayerParty, ...currentEnemies];

        const aliveCombatants = combatants.filter(c => c.status.hp > 0);
        applyPassiveAbilities(aliveCombatants);
        aliveCombatants.sort((a, b) => b.status.spd - a.status.spd || Math.random() - 0.5);

        const actionOrder = aliveCombatants.map(c => c.name).join(' → ');
        logMessage(`行動順: ${actionOrder}`);

        for (const combatant of aliveCombatants) {
            if (isBattleOver()) break;
            if (combatant.status.hp <= 0) continue;

            const actionSkipped = processStatusEffects(combatant);
            if (actionSkipped) continue;

            const isMyCharacter = (window.isHost() && combatant.partyType === 'host') || (!window.isHost() && combatant.partyType === 'client');

            if (window.isOnlineMode()) {
                if (window.isHost()) {
                    // ホスト側のプレイヤーまたは、クライアント側のキャラクターのターン
                    if (isMyCharacter || combatant.partyType === 'client') {
                        if (isMyCharacter) {
                            await playerTurn(combatant);
                        } else {
                            logMessage(`${combatant.name}の行動を待っています...`);
                            await waitForAction();
                        }
                    }
                } else {
                    // クライアント側は何もしない（ホストからの指示を待つ）
                    resetHighlights();
                    logMessage("ホストからの行動を待っています...");
                    await waitForAction();
                }
            } else {
                // シングルプレイモード
                if (isMyCharacter) {
                    await playerTurn(combatant);
                } else {
                    await enemyTurn(combatant);
                }
            }

            resetHighlights();
            updateAllDisplays();
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
}

function waitForAction() {
    return new Promise(resolve => {
        resolveActionPromise = resolve;
    });
}

// --- Turn Handling ---

async function playerTurn(player) {
    resetHighlights();
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
                        player.status.mp += mpCost;
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
                        player.status.mp += mpCost;
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
                    window.sendData('execute_action', actionData);
                }
                executeAction(actionData);
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
            const skill = actor.active.find(s => s.name === data.skillName);
            if (skill) {
                executeSkill(actor, skill);
            }
            break;
        case 'special':
            const special = actor.special;
            if (special && special.name === data.specialName) {
                executeSpecial(actor, special);
            }
            break;
        default:
            console.warn('Unknown action type:', data.action);
            break;
    }

    updateAllDisplays();

    if (window.isOnlineMode() && !window.isHost()) {
        const isMyCharacter = (window.isHost() && actor.partyType === 'host') || (!window.isHost() && actor.partyType === 'client');
        if (!isMyCharacter && resolveActionPromise) {
            resolveActionPromise();
            resolveActionPromise = null;
        }
    }
}

// --- Attack and Damage Calculation ---

function performAttack(attacker, target) {
    logMessage(`${attacker.name}の攻撃！`);
    let attackPower = attacker.status.atk;
    let defensePower = target.status.def;
    if (target.isDefending) {
        defensePower *= 2;
        target.isDefending = false;
        logMessage(`${target.name}は防御している！`, 'defend');
    }
    let damage = Math.max(0, attackPower - defensePower);
    let isCritical = false;
    if (Math.random() < (attacker.status.critRate || 0.1)) {
        isCritical = true;
        damage = Math.floor(damage * (attacker.status.critDamage || 1.5));
        logMessage('会心の一撃！', 'critical');
    }
    damage = applyDamagePassiveEffects(attacker, target, damage);
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

// --- Passive Ability Functions ---

function applyPassiveAbilities(combatants) {
    combatants.forEach(c => {
        if (c.passive && c.passive.id && passiveAbilities[c.passive.id]) {
            passiveAbilities[c.passive.id](c, combatants, logMessage);
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

// --- Skill and Special Abilities ---

async function executeSkill(actor, skill) {
    const effectFunc = skillEffects[skill.id];
    if (effectFunc) {
        const targets = window.isOnlineMode() ? opponentParty : currentEnemies;
        return await effectFunc(actor, currentPlayerParty, targets, selectTarget, logMessage);
    }
    console.warn(`Skill effect not found for ${skill.id}`);
    return false;
}

async function executeSpecial(actor, special) {
    const effectFunc = skillEffects[special.id];
    if (effectFunc) {
        const targets = window.isOnlineMode() ? opponentParty : currentEnemies;
        return await effectFunc(actor, currentPlayerParty, targets, selectTarget, logMessage);
    }
    console.warn(`Special effect not found for ${special.id}`);
    return false;
}

// --- Target Selection ---

function selectTarget() {
    return new Promise(resolve => {
        const targets = window.isOnlineMode() ? opponentParty : currentEnemies;
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

// --- UI Rendering ---

function renderParty(partyEl, partyData, isEnemy) {
    console.log(`✅ renderParty: パーティーをレンダリングします。 (isEnemy: ${isEnemy})`, partyData);
    partyEl.innerHTML = '';
    if (!partyData || partyData.length === 0) {
        console.warn('レンダリングするパーティーデータがありません。');
        return;
    }
    partyData.forEach(member => {
        const memberEl = document.createElement('div');
        memberEl.classList.add('character-card', isEnemy ? 'enemy-character' : 'player-character');
        memberEl.dataset.uniqueId = member.uniqueId;
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

// --- Battle End Conditions ---

function isBattleOver() {
    const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
    const aliveEnemies = window.isOnlineMode() ? opponentParty.filter(o => o.status.hp > 0) : currentEnemies.filter(e => e.status.hp > 0);
    if (alivePlayers.length === 0) {
        return true;
    }
    if (aliveEnemies.length === 0) {
        return true;
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
        handleGameWin();
    }
}

function handleGameWin() {
    logMessage('戦闘勝利！', 'win');
    commandAreaEl.classList.add('hidden');
}

function handleGameLose() {
    logMessage('戦闘敗北...', 'lose');
    commandAreaEl.classList.add('hidden');
}

// --- Passive Effect Functions (from character_abilities.js) ---

function applyDamagePassiveEffects(attacker, target, damage) {
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
window.checkBothPartiesReady = checkBothPartiesReady;

window.handleBattleAction = (data) => {
    switch (data.type) {
        case 'sync_game_state':
            currentPlayerParty = data.playerParty;
            opponentParty = data.opponentParty;
            currentTurn = data.currentTurn;
            isBattleOngoing = data.isBattleOngoing;
            updateAllDisplays();
            if (resolveActionPromise) {
                resolveActionPromise();
                resolveActionPromise = null;
            }
            break;
        case 'battle_end':
            handleBattleEnd();
            break;
        case 'start_battle':
            startBattleClientSide(data);
            break;
    }
};