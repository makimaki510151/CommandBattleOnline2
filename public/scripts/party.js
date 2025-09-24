// party.js (最終版)

import { characters } from './characters.js';

// DOM Elements
const partyScreen = document.getElementById('party-screen');
const characterListEl = document.getElementById('character-list');
const selectedPartyEl = document.getElementById('party-members');
const detailsContentEl = document.getElementById('details-content');
const goButton = document.getElementById('go-button');
const partyBackButton = document.getElementById('party-back-to-title-button');

// Game State
let selectedParty = [];

// Utility Function: Deep copy
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// グローバルに公開する関数
window.initializePlayerParty = initializePlayerParty;
window.checkBothPartiesReady = checkBothPartiesReady;
window.getPlayerParty = () => selectedParty;
window.setMyPartyReady = () => {
    window.myPartyReady = true;
    checkBothPartiesReady();
};

function logMessage(message, type = '') {
    if (window.logMessage) {
        window.logMessage(message, type);
    }
}

// パーティー編成画面の初期化
function initializePlayerParty(initialPartyIds = []) {
    selectedParty = [];
    if (selectedPartyEl) {
        selectedPartyEl.innerHTML = '<p class="placeholder">メンバーを4人選択してください</p>';
    }
    renderCharacterList();
    if (initialPartyIds.length > 0) {
        initialPartyIds.forEach(id => {
            const char = characters.find(c => c.id === id);
            if (char) {
                selectCharacter(char);
            }
        });
    }

    if (!window.isOnlineMode()) {
        if(goButton) {
            goButton.disabled = false;
        }
    }
}

// キャラクターリストの表示
function renderCharacterList() {
    if(!characterListEl) return;
    characterListEl.innerHTML = '';
    characters.forEach(char => {
        const charEl = document.createElement('div');
        charEl.classList.add('character-card');
        charEl.innerHTML = `
            <img src="${char.image}" alt="${char.name}">
            <p>${char.name}</p>
        `;
        charEl.addEventListener('click', () => {
            if (selectedParty.length < 4) {
                selectCharacter(char);
                renderDetails(char);
            }
        });
        characterListEl.appendChild(charEl);
    });
}

// キャラクター選択の処理
function selectCharacter(char) {
    if (selectedParty.length >= 4 || selectedParty.some(c => c.id === char.id)) {
        return;
    }

    if (selectedParty.length === 0 && selectedPartyEl) {
        selectedPartyEl.innerHTML = '';
    }

    const newChar = deepCopy(char);
    selectedParty.push(newChar);
    renderSelectedParty();

    if (selectedParty.length === 4) {
        if(goButton) goButton.disabled = false;
        logMessage('パーティーメンバーが決定しました！', 'info');
    }
}

// 選択済みパーティーの表示
function renderSelectedParty() {
    if(!selectedPartyEl) return;
    selectedPartyEl.innerHTML = '';
    selectedParty.forEach(char => {
        const partyMemberEl = document.createElement('li');
        partyMemberEl.classList.add('party-member');
        partyMemberEl.textContent = char.name;
        partyMemberEl.addEventListener('click', () => {
            removeCharacter(char);
        });
        selectedPartyEl.appendChild(partyMemberEl);
    });
    if (selectedParty.length === 0) {
        selectedPartyEl.innerHTML = '<p class="placeholder">メンバーを4人選択してください</p>';
    }
}

// パーティーメンバーの削除
function removeCharacter(charToRemove) {
    selectedParty = selectedParty.filter(char => char.uniqueId !== charToRemove.uniqueId);
    renderSelectedParty();
    if (selectedParty.length < 4) {
        if(goButton) goButton.disabled = true;
    }
}

// キャラクター詳細の表示
function renderDetails(char) {
    if(!detailsContentEl) return;
    detailsContentEl.innerHTML = `
        <h3>${char.name}</h3>
        <p>HP: ${char.maxHp}</p>
        <p>攻撃: ${char.atk}</p>
        <p>防御: ${char.def}</p>
        <p>素早さ: ${char.speed}</p>
        <h4>スキル</h4>
        <ul>
            ${char.skills.map(skill => `<li>${skill.name}</li>`).join('')}
        </ul>
    `;
}

// オンラインモードでのパーティー準備チェック
function checkBothPartiesReady() {
    logMessage(`パーティー準備状況: 自分(${window.myPartyReady}), 相手(${window.opponentPartyReady})`, 'info');
    if (window.myPartyReady && window.opponentPartyReady) {
        if(goButton) goButton.disabled = false;
        logMessage('両方のパーティーが準備完了しました！決定ボタンを押して対戦を開始してください。', 'success');
    }
}

// イベントリスナーのセットアップ
if (goButton) {
    goButton.addEventListener('click', () => {
        if (selectedParty.length === 4) {
            logMessage('対戦準備中...', 'info');
            goButton.disabled = true;
            if (window.isOnlineMode()) {
                window.myPartyReady = true;
                if (window.isHost()) {
                    window.sendData('sync_party', selectedParty.map(c => c.id));
                    checkBothPartiesReady();
                }
            } else {
                window.startBattleWithMyParty(selectedParty);
            }
        } else {
            logMessage('パーティーメンバーを4人選択してください。', 'error');
        }
    });
}
if (partyBackButton) {
    partyBackButton.addEventListener('click', () => {
        if (partyScreen) partyScreen.classList.add('hidden');
        const titleScreen = document.getElementById('title-screen');
        if (titleScreen) titleScreen.classList.remove('hidden');
        if (window.isOnlineMode()) {
            window.cleanupConnection();
        }
    });
}