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

function updateAllDisplays() {
    updatePartyDisplay(playerPartyEl, currentPlayerParty, false);
    updatePartyDisplay(enemyPartyEl, currentEnemies, true);
    // オンラインモードで相手のパーティーが存在する場合
    if (window.isOnlineMode() && opponentParty) {
        updatePartyDisplay(enemyPartyEl, opponentParty, true);
    }
}

function updatePartyDisplay(partyElement, partyData, isEnemy = false) {
    partyElement.innerHTML = ''; // Clear current display
    partyData.forEach((character, index) => {
        if (character.status.hp > 0) {
            const characterEl = document.createElement('div');
            characterEl.classList.add('character-card', isEnemy ? 'enemy-character' : 'player-character');
            characterEl.setAttribute('data-index', index);
            characterEl.innerHTML = `
                <div class="name-bar">${character.name}</div>
                <div class="status-bar">
                    <div class="hp-bar" style="width: ${(character.status.hp / character.status.maxHp) * 100}%"></div>
                    <div class="hp-text">${character.status.hp} / ${character.status.maxHp}</div>
                </div>
                <div class="mp-bar-container">
                    <div class="mp-bar" style="width: ${(character.status.mp / character.status.maxMp) * 100}%"></div>
                </div>
            `;
            partyElement.appendChild(characterEl);
        }
    });
}

// --- Game Logic Functions ---

function startBattle() {
    isBattleOngoing = true;
    currentEnemies = deepCopy(enemyGroups[currentGroupIndex]);
    currentPlayerParty = window.getPlayerParty();
    updateAllDisplays();
    logMessage('戦闘開始！');
    goButton.classList.add('hidden');
    
    // シングルプレイの場合のみ、最初のターンを開始
    if (!window.isOnlineMode()) {
        startTurn();
    } else {
        // オンライン対戦の場合、パーティ準備完了を通知
        myPartyReady = true;
        window.sendData({
            type: 'partyReady'
        });
        checkBothPartiesReady();
    }
}

function handleOpponentParty(party) {
    opponentParty = party;
    updateAllDisplays();
    logMessage('相手のパーティーが準備完了しました！');
    opponentPartyReady = true;
    checkBothPartiesReady();
}

function checkBothPartiesReady() {
    if (myPartyReady && opponentPartyReady) {
        logMessage('両方のパーティーが準備完了しました。オンライン対戦を開始します！');
        isBattleOngoing = true;
        currentTurn = 0;
        updateAllDisplays();
        startTurn();
    }
}

function startOnlineBattle() {
    currentPlayerParty = window.getPlayerParty();
    myPartyReady = true;
    window.sendData({
        type: 'partyReady',
        party: currentPlayerParty
    });
}

function startTurn() {
    if (!isBattleOngoing) return;

    currentTurn++;
    logMessage(`--- ターン ${currentTurn} ---`, 'turn');

    activePlayerIndex = 0;

    // パッシブ効果の適用
    applyPassiveAbilities(currentPlayerParty);

    // 行動順を決定（素早さ順）
    const allCharacters = [...currentPlayerParty, ...currentEnemies];
    allCharacters.sort((a, b) => b.status.speed - a.status.speed);

    // 行動ループ
    let actionLoop = async () => {
        if (!isBattleOngoing) return;
        
        let character = allCharacters.shift();
        if (!character || character.status.hp <= 0) {
            // 行動不能なキャラクターはスキップ
            if (allCharacters.length > 0) {
                actionLoop();
            } else {
                endTurn();
            }
            return;
        }

        // 状態異常チェック
        if (character.status.poison > 0) {
            const poisonDamage = Math.floor(character.status.maxHp * 0.05);
            character.status.hp -= poisonDamage;
            logMessage(`${character.name} は毒に侵されている！${poisonDamage}のダメージ！`, 'damage');
        }

        updateAllDisplays();

        // プレイヤーの行動
        if (currentPlayerParty.some(p => p.uniqueId === character.uniqueId)) {
            let player = currentPlayerParty.find(p => p.uniqueId === character.uniqueId);
            commandAreaEl.classList.remove('hidden');
            logMessage(`${player.name} の行動...`, 'action');
            highlightActiveCharacter(player);
            // オンラインモードでは相手の行動を待つ
            if (window.isOnlineMode()) {
                commandAreaEl.classList.add('hidden');
                logMessage('相手の行動を待っています...', 'info');
                // ここでサーバーからのアクションを待つ
                const actionData = await new Promise(resolve => {
                    window.handleBattleAction = (data) => {
                        if (data.type === 'playerAction') {
                            resolve(data);
                        }
                    };
                });
                executeAction(player, actionData.action);
                actionLoop();
            } else {
                await selectAction(player);
                actionLoop();
            }
        }
        // 敵の行動
        else {
            logMessage(`${character.name} の行動...`, 'action');
            highlightActiveCharacter(character);
            const target = currentPlayerParty.filter(p => p.status.hp > 0)[Math.floor(Math.random() * currentPlayerParty.length)];
            const action = {
                type: 'skill',
                skill: character.active[0],
                targetId: target.uniqueId
            };
            executeAction(character, action);
            setTimeout(actionLoop, 1000);
        }
    };
    actionLoop();
}

function endTurn() {
    if (!isBattleOngoing) return;

    // ターン終了時パッシブ効果の適用
    endTurnPassiveAbilities(currentPlayerParty);
    
    // 戦闘終了判定
    const playerPartyAlive = currentPlayerParty.some(p => p.status.hp > 0);
    const enemyPartyAlive = currentEnemies.some(e => e.status.hp > 0);
    const opponentPartyAlive = window.isOnlineMode() ? opponentParty.some(p => p.status.hp > 0) : true;

    if (!playerPartyAlive) {
        isBattleOngoing = false;
        logMessage('あなたのパーティーは全滅しました。', 'end');
    } else if (!enemyPartyAlive || !opponentPartyAlive) {
        isBattleOngoing = false;
        logMessage('敵を打ち破った！', 'end');
    } else {
        updateAllDisplays();
        setTimeout(startTurn, 1000);
    }
}

function executeAction(attacker, action) {
    if (!attacker || attacker.status.hp <= 0) return;

    if (action.type === 'skill') {
        const skill = attacker.active.find(s => s.name === action.skill.name);
        if (skill && attacker.status.mp >= skill.mpCost) {
            attacker.status.mp -= skill.mpCost;

            const targets = (window.isOnlineMode() ? opponentParty : currentEnemies);
            const target = targets.find(t => t.uniqueId === action.targetId);

            logMessage(`${attacker.name} は ${skill.name} を使った！`);
            skillEffects[skill.effect](attacker, target);
        }
    } else if (action.type === 'special') {
        const specialSkill = attacker.active.find(s => s.isSpecial);
        if (specialSkill) {
            logMessage(`${attacker.name} は ${specialSkill.name} を使った！`);
            skillEffects[specialSkill.effect](attacker, null); // 特殊技は対象なしの場合も
        }
    } else if (action.type === 'defend') {
        logMessage(`${attacker.name} は防御の構えをとった。`);
        attacker.status.defending = true;
    }
    
    // 状態を同期
    if (window.isOnlineMode()) {
        window.sendData({
            type: 'syncGameState',
            playerParty: currentPlayerParty,
            opponentParty: opponentParty,
            currentEnemies: currentEnemies,
            activePlayerIndex: activePlayerIndex,
            currentTurn: currentTurn,
            isBattleOngoing: isBattleOngoing
        });
    }
    
    updateAllDisplays();
}

function selectAction(player) {
    return new Promise(resolve => {
        // コマンドUIの表示とイベントリスナーの設定
        const commandHtml = createCommandMenu(player);
        commandAreaEl.innerHTML = commandHtml;
        updateCommandMenu(player);

        const skillButtons = commandAreaEl.querySelectorAll('.skill-button');
        skillButtons.forEach(button => {
            button.addEventListener('click', () => {
                const skillName = button.textContent;
                const skill = player.active.find(s => s.name === skillName);
                if (skill) {
                    selectTarget(player, skill).then(target => {
                        const action = { type: 'skill', skill: skill, targetId: target.uniqueId };
                        resolve(action);
                    });
                }
            });
        });

        const defendButton = commandAreaEl.querySelector('.action-defend');
        defendButton.addEventListener('click', () => {
            const action = { type: 'defend' };
            resolve(action);
        });
    });
}

function selectTarget(player, skill) {
    return new Promise(resolve => {
        const targets = skill.isHeal ? currentPlayerParty.filter(p => p.status.hp > 0) :
                                        currentEnemies.filter(e => e.status.hp > 0);
        
        const targetElements = document.querySelectorAll(skill.isHeal ? '.player-character' : '.enemy-character');
        targetElements.forEach(el => {
            el.classList.add('selecting-target');
            el.addEventListener('click', function handler() {
                const targetIndex = parseInt(el.getAttribute('data-index'));
                const target = skill.isHeal ? currentPlayerParty[targetIndex] : currentEnemies[targetIndex];
                resetHighlights();
                resolve(target);
            }, { once: true });
        });
    });
}

function highlightActiveCharacter(character) {
    const characterEls = document.querySelectorAll('.player-character, .enemy-character');
    characterEls.forEach(el => {
        el.classList.remove('active');
        if (el.textContent.includes(character.name)) {
            el.classList.add('active');
        }
    });
}

function createCommandMenu(player) {
    return `
        <p>${player.name} の行動</p>
        <div class="command-grid">
            <div class="skill-menu"></div>
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
window.startOnlineBattle = startOnlineBattle;
window.handleBattleAction = (data) => {
    switch(data.type) {
        case 'partyReady':
            if (window.isHost()) {
                opponentParty = data.party;
            } else {
                opponentParty = data.party;
            }
            logMessage('相手のパーティーが準備完了しました！');
            opponentPartyReady = true;
            checkBothPartiesReady();
            break;
        case 'playerAction':
            // 相手の行動を受信した場合
            const player = window.isHost() ? opponentParty.find(p => p.uniqueId === data.playerId) : currentPlayerParty.find(p => p.uniqueId === data.playerId);
            if (player) {
                executeAction(player, data.action);
            }
            break;
        case 'syncGameState':
            currentPlayerParty = data.playerParty;
            opponentParty = data.opponentParty;
            currentTurn = data.currentTurn;
            isBattleOngoing = data.isBattleOngoing;
            updateAllDisplays();
            logMessage('ゲーム状態を同期しました。');
            break;
        case 'logMessage':
            logMessage(data.message, data.logType);
            break;
        case 'battleEnd':
            isBattleOngoing = false;
            logMessage(data.message, 'end');
            break;
        default:
            console.log('Unknown battle action received:', data.type);
            break;
    }
};
