// party.js

import { characters } from './characters.js';
import { sendPartyData, isPeerConnected } from './skyway.js';

let selectedCharacterId = null;
let partyMembers = [];
let opponentParty = [];

const characterListEl = document.getElementById('character-list');
const characterDetailsEl = document.getElementById('details-content');
const partySlotsEl = document.querySelector('.party-slots');

// キャラクターカードの描画
function renderCharacterCards() {
    characterListEl.innerHTML = '';
    characters.forEach(char => {
        const card = document.createElement('div');
        card.className = 'character-card';
        card.dataset.id = char.id;
        card.innerHTML = `
            <img src="${char.image}" alt="${char.name}" class="char-thumb">
            <div class="char-info">
                <h4>${char.name}</h4>
                <p>${char.role}</p>
            </div>
        `;
        characterListEl.appendChild(card);
    });
}

// キャラクター詳細の描画
function renderCharacterDetails(char) {
    if (!char) {
        characterDetailsEl.innerHTML = '<p class="placeholder">キャラクターを選択してください</p>';
        return;
    }
    characterDetailsEl.innerHTML = `
        <img src="${char.image}" alt="${char.name}" class="char-image">
        <h4>${char.name} <small>(${char.role})</small></h4>
        <div class="status-list">
            <p><strong>HP:</strong> ${char.status.hp} / ${char.status.maxHp}</p>
            <p><strong>MP:</strong> ${char.status.mp} / ${char.status.maxMp}</p>
            <p><strong>攻撃力:</strong> ${char.status.atk}</p>
            <p><strong>魔法力:</strong> ${char.status.matk}</p>
            <p><strong>防御力:</strong> ${char.status.def}</p>
            <p><strong>魔法防御力:</strong> ${char.status.mdef}</p>
            <p><strong>素早さ:</strong> ${char.status.spd}</p>
        </div>
        <div class="skills">
            <p><strong>パッシブ:</strong> ${char.passive.name} <small>${char.passive.desc}</small></p>
            <h4>アクティブスキル</h4>
            <ul>
                ${char.active.map(skill => `<li class="skill-name" data-description="${skill.desc} (${skill.mp}MP)">${skill.name}</li>`).join('')}
            </ul>
        </div>
        <div class="special">
            <h4>必殺技: ${char.special.name}</h4>
            <p>${char.special.desc} (${char.special.mp}MP)</p>
        </div>
    `;
}

// 初期化
renderCharacterCards();

// キャラクターカード選択イベント
characterListEl.addEventListener('click', (e) => {
    const card = e.target.closest('.character-card');
    if (!card) return;

    // 選択状態を解除
    document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    
    selectedCharacterId = card.dataset.id;
    const char = characters.find(c => c.id === selectedCharacterId);
    renderCharacterDetails(char);
});

// パーティースロットへのキャラクター追加/削除
partySlotsEl.addEventListener('click', (e) => {
    const slot = e.target.closest('.party-slot');
    if (!slot) return;

    const char = characters.find(c => c.id === selectedCharacterId);

    if (selectedCharacterId && !slot.classList.contains('filled')) {
        const isAlreadyInParty = partyMembers.some(member => member.id === selectedCharacterId);
        if (isAlreadyInParty) {
            alert('そのキャラクターはすでにパーティーにいます。');
            return;
        }

        if (char) {
            slot.innerHTML = '';
            const imgEl = document.createElement('img');
            imgEl.src = char.image;
            imgEl.alt = char.name;
            imgEl.className = 'char-icon';
            slot.appendChild(imgEl);

            slot.dataset.charId = char.id;
            slot.classList.add('filled');

            // 選択されたキャラクターに現在のステータスをコピーしてパーティーに加える
            const partyChar = { ...char, status: { ...char.status } };
            partyMembers.push(partyChar);

            // マルチプレイの場合、パーティー更新を通知
            if (isPeerConnected()) {
                sendPartyData(partyMembers);
            }

            selectedCharacterId = null;
            document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
            renderCharacterDetails(null);
        }
    } else if (slot.classList.contains('filled')) {
        const charIdToRemove = slot.dataset.charId;
        slot.innerHTML = '';
        slot.classList.remove('filled');
        slot.dataset.charId = '';

        partyMembers = partyMembers.filter(member => member.id !== charIdToRemove);
        
        // マルチプレイの場合、パーティー更新を通知
        if (isPeerConnected()) {
            sendPartyData(partyMembers);
        }
    }
});

// パーティー編成データを取得する関数
window.getSelectedParty = () => partyMembers;
window.getOpponentParty = () => opponentParty;
window.setOpponentParty = (party) => {
    opponentParty = party;
    alert('対戦相手のパーティーが編成されました！');
};