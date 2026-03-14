// party.js (修正版)

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
        card.draggable = true;
        card.innerHTML = `
            <img src="${char.image}" alt="${char.name}" class="char-thumb" draggable="false">
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
                <span class="skill-tooltip">${skill.flavor}</span>
            </li>
            `).join("")}
        </ul>
        ${char.special ? `
        <h5>必殺技</h5>
        <p>
            <strong class="skill-name" data-description="${char.special.flavor}">${char.special.name}</strong>: ${char.special.desc}
            <span class="skill-tooltip">${char.special.flavor}</span>
        </p>
        ` : '<!-- 必殺技無効化 -->'}
    `;
}

// キャラクターカード選択イベント
characterListEl.addEventListener('click', (event) => {
    const card = event.target.closest('.character-card');
    if (!card) return;

    document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    selectedCharacterId = card.dataset.id;
    const selectedChar = characters.find(c => c.id === selectedCharacterId);
    renderCharacterDetails(selectedChar);
});

// スロットにキャラを配置する共通処理
function placeCharInSlot(slot, char) {
    slot.innerHTML = '';
    const imgEl = document.createElement('img');
    imgEl.src = char.image;
    imgEl.alt = char.name;
    imgEl.className = 'char-icon';
    imgEl.draggable = false;
    slot.appendChild(imgEl);
    slot.dataset.charId = char.id;
    slot.classList.add('filled');
    slot.draggable = true;
}

// スロットからキャラを削除する共通処理
function clearSlot(slot) {
    slot.innerHTML = '';
    slot.classList.remove('filled');
    delete slot.dataset.charId;
    slot.draggable = false;
}

// スロット状態から partyMembers を同期
function syncPartyFromSlots() {
    partyMembers = [];
    document.querySelectorAll('.party-slot').forEach(slot => {
        if (slot.classList.contains('filled') && slot.dataset.charId) {
            const char = characters.find(c => c.id === slot.dataset.charId);
            if (char) partyMembers.push(JSON.parse(JSON.stringify(char)));
        }
    });
}

// パーティースロット配置イベント（クリック）
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
            placeCharInSlot(slot, char);
            syncPartyFromSlots();
            selectedCharacterId = null;
            document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
            renderCharacterDetails(null);
        }
    } else if (slot.classList.contains('filled')) {
        clearSlot(slot);
        syncPartyFromSlots();
    }
});

// --- ドラッグ&ドロップ（キャラ一覧カード → スロット、スロット間）---

// キャラ一覧カード: ドラッグ時はカードUIをプレビューに（画像単体を持ち上げない）
characterListEl.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.character-card');
    if (!card || !card.dataset.id) return;
    const charId = card.dataset.id;
    const char = characters.find(c => c.id === charId);
    if (!char || partyMembers.some(m => m.id === charId)) return;

    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'from-list', charId }));
    e.dataTransfer.effectAllowed = 'copy';

    // カード全体をドラッグプレビューに（画像単体を持ち上げない）
    const rect = card.getBoundingClientRect();
    e.dataTransfer.setDragImage(card, rect.width / 2, rect.height / 2);
});

// パーティースロット: ドラッグ時はスロットUIをプレビューに
partySlotsEl.addEventListener('dragstart', (e) => {
    const slot = e.target.closest('.party-slot');
    if (!slot || !slot.classList.contains('filled')) return;
    const charId = slot.dataset.charId;
    const slotId = slot.dataset.slotId;

    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'from-slot', charId, slotId }));
    e.dataTransfer.effectAllowed = 'move';

    const rect = slot.getBoundingClientRect();
    e.dataTransfer.setDragImage(slot, rect.width / 2, rect.height / 2);
});

// スロット: ドロップ許可
partySlotsEl.addEventListener('dragover', (e) => {
    const slot = e.target.closest('.party-slot');
    if (!slot) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    slot.classList.add('drop-target');
});

partySlotsEl.addEventListener('dragleave', (e) => {
    const slot = e.target.closest('.party-slot');
    if (slot && !slot.contains(e.relatedTarget)) slot.classList.remove('drop-target');
});

partySlotsEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const slot = e.target.closest('.party-slot');
    if (!slot) return;
    slot.classList.remove('drop-target');

    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const { type, charId, slotId: sourceSlotId } = data;

        const char = characters.find(c => c.id === charId);
        if (!char) return;

        const targetSlotId = slot.dataset.slotId;
        const isSameSlot = type === 'from-slot' && sourceSlotId === targetSlotId;
        if (isSameSlot) return;

        if (type === 'from-list') {
            if (partyMembers.some(m => m.id === charId)) return;
            if (slot.classList.contains('filled')) {
                clearSlot(slot);
            }
            placeCharInSlot(slot, char);
            syncPartyFromSlots();
        } else if (type === 'from-slot') {
            const sourceSlot = document.querySelector(`.party-slot[data-slot-id="${sourceSlotId}"]`);
            if (!sourceSlot) return;
            if (slot.classList.contains('filled')) {
                // スロット間スワップ
                const targetCharId = slot.dataset.charId;
                const targetChar = characters.find(c => c.id === targetCharId);
                if (targetChar) {
                    clearSlot(sourceSlot);
                    clearSlot(slot);
                    placeCharInSlot(sourceSlot, targetChar);
                    placeCharInSlot(slot, char);
                }
            } else {
                // 空きスロットへ移動
                clearSlot(sourceSlot);
                placeCharInSlot(slot, char);
            }
            syncPartyFromSlots();
        }
    } catch (_) {
        /* 無効なデータを無視 */
    }
});

// ドラッグ終了時にドロップターゲット用クラスを削除
document.addEventListener('dragend', () => {
    document.querySelectorAll('.party-slot.drop-target').forEach(s => s.classList.remove('drop-target'));
});

// パーティー編成データを取得する関数
function getSelectedParty() {
    return partyMembers;
}

// グローバルスコープに公開
window.getSelectedParty = getSelectedParty;

// 初期描画
renderCharacterCards();
renderCharacterDetails(null);
