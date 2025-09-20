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
            <p><strong>会心率:</strong> ${char.status.criticalRate * 100}%</p>
            <p><strong>回避率:</strong> ${char.status.dodgeRate * 100}%</p>
            <p><strong>会心倍率:</strong> ${char.status.criticalMultiplier}倍</p>
        </div>
        <h5>パッシブスキル</h5>
        <p>
            <strong class="skill-name" data-description="${char.passive.flavor}">${char.passive.name}</strong>: ${char.passive.desc}
        </p>
        <h5>アクティブスキル</h5>
        <ul>
            ${char.active.map(skill => `
            <li>
                <strong class="skill-name" data-description="${skill.flavor}">${skill.name}</strong>: ${skill.desc}
            </li>
            `).join('')}
        </ul>
        <h5>必殺技</h5>
        <p>
            <strong class="skill-name" data-description="${char.special.flavor}">${char.special.name}</strong>: ${char.special.desc}
        </p>
    `;
}

// キャラクターカード選択イベント
characterListEl.addEventListener('click', (event) => {
    const card = event.target.closest('.character-card');
    if (!card) return;

    // 選択状態をリセット
    document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    selectedCharacterId = card.dataset.id;
    const selectedChar = characters.find(c => c.id === selectedCharacterId);
    renderCharacterDetails(selectedChar);
});

// パーティースロット配置イベント
partySlotsEl.addEventListener('click', (event) => {
    const slot = event.target.closest('.party-slot');
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
function getSelectedParty() {
    return partyMembers;
}

// グローバルスコープに公開
window.getSelectedParty = getSelectedParty;

// 最初の描画
renderCharacterCards();