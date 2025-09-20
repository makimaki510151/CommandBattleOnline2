// party.js

import { characters } from './characters.js';

let selectedCharacterId = null;
let partyMembers = [];

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
            <p><strong>速度:</strong> ${char.status.spd}</p>
            <p><strong>補助力:</strong> ${char.status.support}</p>
        </div>
        <div class="skill-info">
            <h5>パッシブスキル</h5>
            <p><strong>${char.passive.name}:</strong> ${char.passive.desc}</p>
            <h5>アクティブスキル</h5>
            ${char.active.map(skill => `<p><strong>${skill.name}:</strong> ${skill.desc} (MP: ${skill.mp})</p>`).join('')}
            <h5>必殺技</h5>
            <p><strong>${char.special.name}:</strong> ${char.special.desc} (MP: ${char.special.mp})</p>
        </div>
    `;
}

// イベントリスナーのセットアップ
characterListEl.addEventListener('click', (event) => {
    const card = event.target.closest('.character-card');
    if (card) {
        const id = card.dataset.id;
        if (selectedCharacterId === id) {
            selectedCharacterId = null;
            card.classList.remove('selected');
            renderCharacterDetails(null);
        } else {
            document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
            selectedCharacterId = id;
            card.classList.add('selected');
            const char = characters.find(c => c.id === id);
            renderCharacterDetails(char);
        }
    }
});

partySlotsEl.addEventListener('click', (event) => {
    const slot = event.target.closest('.party-slot');
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
    }
});

// パーティー編成データを取得する関数
export function getSelectedParty() {
    return partyMembers;
}

// ページロード時にキャラクターカードをレンダリング
window.addEventListener('load', () => {
    renderCharacterCards();
});