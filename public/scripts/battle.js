// battle.js (オンライン同期強化版・再々修正)

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
let executingCharacter = null;

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
    const partyType = window.isHost() ? 'host' : 'client';
    currentPlayerParty = initializeParty(partyData, partyType);
    renderParty(playerPartyEl, currentPlayerParty, false);
    if (window.isOnlineMode() && !window.isHost()) {
        enemyPartyEl.innerHTML = '<p class="waiting-message">相手の準備を待っています...</p>';
    }
    myPartyReady = true;
    logMessage('自分のパーティーの準備が完了しました。');
    checkBothPartiesReady();
}

function handleOpponentParty(partyData) {
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
    checkBothPartiesReady();
}

function checkBothPartiesReady() {
    if (myPartyReady && opponentPartyReady) {
        logMessage('両者の準備が完了しました。');
        if (window.isOnlineMode() && window.isHost()) {
            logMessage('ホストとして戦闘開始処理を実行。');
            window.sendData('start_battle', { initialState: {
                playerParty: currentPlayerParty,
                opponentParty: opponentParty,
                currentTurn: 0,
                isBattleOngoing: true
            }});
            startOnlineBattleHostSide();
        }
    }
}

async function startOnlineBattleHostSide() {
    isBattleOngoing = true;
    currentTurn = 0;
    logMessage("戦闘開始！");
    await battleLoop();
}

function startOnlineBattleClientSide(initialState) {
    isBattleOngoing = true;
    currentTurn = initialState.currentTurn;
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
}

// --- Core Battle Logic ---

async function battleLoop() {
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

            const isMyCharacter = combatant.partyType === 'host';
            const isOpponentCharacter = combatant.partyType === 'client';

            if (isMyCharacter) {
                // ホスト側のキャラクターのターン
                await playerTurn(combatant);
            } else if (isOpponentCharacter) {
                // クライアント側のキャラクターのターン
                resetHighlights();
                const combatantEl = document.querySelector(`[data-unique-id="${combatant.uniqueId}"]`);
                if (combatantEl) {
                    combatantEl.classList.add('active');
                }
                logMessage(`${combatant.name}の行動を待っています...`);

                // クライアントに行動を要求
                window.sendData('request_action', { actorUniqueId: combatant.uniqueId });

                // クライアントからの行動を待つ
                await new Promise(resolve => {
                    resolveClientActionPromise = resolve;
                });
            } else {
                // シングルプレイモードの敵ターン (今回の修正では使わないが、念のため残す)
                await enemyTurn(combatant);
            }
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

// クライアントからのアクション実行要求
window.handleActionRequest = async (data) => {
    const actor = opponentParty.find(c => c.uniqueId === data.actorUniqueId);
    if (!actor) return;
    executingCharacter = actor;
    
    // クライアント側のUIを更新
    resetHighlights();
    const combatantEl = document.querySelector(`[data-unique-id="${actor.uniqueId}"]`);
    if (combatantEl) {
        combatantEl.classList.add('active');
    }
    logMessage(`${actor.name}のターン！`, 'character-turn');
    
    // クライアント側のコマンドメニューを表示
    commandAreaEl.classList.remove('hidden');
    updateCommandMenu(actor);

    // クライアント側のプレイヤー入力待ち
    await new Promise(resolve => {
        const handleCommand = async (event) => {
            const target = event.target;
            let actionData = null;

            if (target.matches('.action-attack')) {
                const targetInfo = await selectTarget();
                if (targetInfo) {
                    actionData = {
                        action: 'attack',
                        actorUniqueId: actor.uniqueId,
                        targetUniqueId: targetInfo.target.uniqueId
                    };
                }
            } else if (target.matches('.action-defend')) {
                actionData = { action: 'defend', actorUniqueId: actor.uniqueId };
            }

            if (actionData) {
                commandAreaEl.removeEventListener('click', handleCommand);
                commandAreaEl.classList.add('hidden');
                window.sendData('execute_action', actionData);
                resolve();
            }
        };
        commandAreaEl.addEventListener('click', handleCommand);
    });
};

function executeAction(data) {
    const allCombatants = window.isOnlineMode() ? [...currentPlayerParty, ...opponentParty] : [...currentPlayerParty, ...currentEnemies];
    const actor = allCombatants.find(c => c.uniqueId === data.actorUniqueId);
    if (!actor) {
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
    }

    updateAllDisplays();

    // ホスト側で、クライアントからのアクション完了を解決
    if (window.isOnlineMode() && window.isHost() && resolveClientActionPromise) {
        resolveClientActionPromise();
        resolveClientActionPromise = null;
    }
}

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

function selectTarget() {
    return new Promise(resolve => {
        const targets = window.isOnlineMode() ? (window.isHost() ? opponentParty : currentPlayerParty) : currentEnemies;
        if (!targets) {
            console.error('ターゲットパーティーがnullです。');
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

function renderParty(partyEl, partyData, isEnemy) {
    partyEl.innerHTML = '';
    if (!partyData || partyData.length === 0) {
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
        <button class="action-defend">防御</button>
    `;
}

function resetHighlights() {
    document.querySelectorAll('.character-card').forEach(card => {
        card.classList.remove('active');
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
    });
}

function isBattleOver() {
    const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
    const aliveEnemies = opponentParty.filter(o => o.status.hp > 0);
    return alivePlayers.length === 0 || aliveEnemies.length === 0;
}

function handleBattleEnd() {
    isBattleOngoing = false;
    const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
    const aliveEnemies = opponentParty.filter(o => o.status.hp > 0);
    if (alivePlayers.length === 0) {
        logMessage('戦闘敗北...', 'lose');
    } else {
        logMessage('戦闘勝利！', 'win');
    }
    commandAreaEl.classList.add('hidden');
}

// ホストからゲーム状態の同期を受け取る
window.syncGameStateClientSide = (data) => {
    currentPlayerParty = data.playerParty;
    opponentParty = data.opponentParty;
    currentTurn = data.currentTurn;
    isBattleOngoing = data.isBattleOngoing;
    updateAllDisplays();
};

window.getPlayerParty = () => currentPlayerParty;
window.initializePlayerParty = initializePlayerParty;
window.handleOpponentParty = handleOpponentParty;
window.checkBothPartiesReady = checkBothPartiesReady;
window.startOnlineBattleHostSide = startOnlineBattleHostSide;
window.startOnlineBattleClientSide = startOnlineBattleClientSide;
window.handleActionRequest = window.handleActionRequest || (() => console.log('Action request received.'));
window.executeAction = executeAction;