// party.js (最終修正版)

import { characters } from './characters.js';

let selectedCharacterId = null;
let partyMembers = [];

const characterSelectionEl = document.getElementById('character-selection');
const detailsContentEl = document.getElementById('details-content');
const goButton = document.getElementById('go-button');
let partySlots = [];

// `main.js`から呼び出される初期化関数
window.initializePartyScreen = function() {
    partyMembers = [];
    selectedCharacterId = null;
    partySlots = Array.from(document.querySelectorAll('.party-slot'));
    
    renderCharacterList();
    renderPartySlots();
    renderCharacterDetails(null);
    updateGoButton();
};

function setupEventListeners() {
    // 古いイベントリスナーを削除してから、新しいイベントリスナーを追加する
    const characterButtons = document.querySelectorAll('.character-button');
    characterButtons.forEach(button => {
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        newButton.addEventListener('click', handleCharacterButtonClick);
    });

    partySlots.forEach(slot => {
        const newSlot = slot.cloneNode(true);
        slot.parentNode.replaceChild(newSlot, slot);
        newSlot.addEventListener('click', handlePartySlotClick);
    });
}

function handleCharacterButtonClick(event) {
    const card = event.currentTarget;
    document.querySelectorAll('.character-button').forEach(b => b.classList.remove('selected'));
    card.classList.add('selected');

    selectedCharacterId = card.dataset.charId;
    const selectedChar = characters.find(c => c.id === selectedCharacterId);
    renderCharacterDetails(selectedChar);
}

function handlePartySlotClick(event) {
    const slot = event.currentTarget;
    const slotIndex = parseInt(slot.dataset.slotId);

    // スロットが空で、かつキャラクターが選択されている場合
    if (!slot.dataset.charId && selectedCharacterId) {
        const char = characters.find(c => c.id === selectedCharacterId);
        const isAlreadyInParty = partyMembers.some(member => member && member.id === selectedCharacterId);
        if (isAlreadyInParty) {
            alert('そのキャラクターはすでにパーティーにいます。');
            return;
        }
        
        const imgEl = document.createElement('img');
        imgEl.src = char.icon;
        imgEl.alt = char.name;
        imgEl.className = 'char-icon';
        slot.innerHTML = '';
        slot.appendChild(imgEl);
        slot.dataset.charId = char.id;
        
        partyMembers[slotIndex] = JSON.parse(JSON.stringify(char));

        selectedCharacterId = null;
        document.querySelectorAll('.character-button').forEach(b => b.classList.remove('selected'));
        renderCharacterDetails(null);
        
    // スロットにキャラクターがいて、それを削除する場合
    } else if (slot.dataset.charId) {
        const charIdToRemove = slot.dataset.charId;
        slot.innerHTML = '+';
        slot.title = 'メンバーを追加';
        delete slot.dataset.charId;
        
        partyMembers[slotIndex] = undefined;
    }
    
    renderCharacterList();
    updateGoButton();
}


function renderCharacterList() {
    const listHtml = `
        <h3>キャラクターリスト</h3>
        <div class="character-list">
            ${characters.map(char => {
                const isSelected = partyMembers.some(p => p && p.id === char.id);
                return `<button class="character-button" data-char-id="${char.id}" ${isSelected ? 'disabled' : ''}>
                            <img src="${char.icon}" alt="${char.name}のアイコン">
                            ${char.name}
                        </button>`;
            }).join('')}
        </div>
    `;
    const controls = characterSelectionEl.querySelector('.controls').outerHTML;
    characterSelectionEl.innerHTML = `<h2>パーティー編成</h2>${controls}${listHtml}`;
    setupEventListeners(); // 新しいボタンにイベントリスナーを再設定
}

function renderPartySlots() {
    partySlots.forEach((slot, index) => {
        const character = partyMembers[index];
        if (character) {
            slot.innerHTML = `<img src="${character.icon}" alt="${character.name}">`;
            slot.title = character.name;
            slot.dataset.charId = character.id;
        } else {
            slot.innerHTML = '+';
            slot.title = 'メンバーを追加';
            delete slot.dataset.charId;
        }
    });
}

function renderCharacterDetails(char) {
    if (!char) {
        detailsContentEl.innerHTML = '<p class="placeholder">キャラクターを選択してください</p>';
        return;
    }
    
    detailsContentEl.innerHTML = `
        <img src="${char.icon}" alt="${char.name}" class="char-image">
        <h4>${char.name} <small>(${char.role})</small></h4>
        <div class="status-list">
            <p><strong>HP:</strong> ${char.status.maxHp}</p>
            <p><strong>MP:</strong> ${char.status.maxMp}</p>
            <p><strong>攻撃力:</strong> ${char.status.atk}</p>
            <p><strong>防御力:</strong> ${char.status.def}</p>
            <p><strong>速度:</strong> ${char.status.spd}</p>
        </div>
        <h5>スキル</h5>
        <ul>
            ${char.skills.map(skill => `
            <li>
                <strong class="skill-name">${skill.name}</strong>: ${skill.desc}
            </li>
            `).join('')}
        </ul>
    `;
}

function updateGoButton() {
    if (goButton) {
        goButton.disabled = partyMembers.filter(p => p).length === 0;
    }
}

window.getSelectedParty = () => {
    return partyMembers.filter(p => p);
};