// party.js (修正版)

import { characters } from './characters.js';

let selectedCharacterId = null;
let partyMembers = [];
let draggedCharacterId = null;

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

// キャラクターをスロットに追加する関数
function addCharacterToSlot(slot, charId) {
    const char = characters.find(c => c.id === charId);
    if (!char) return false;

    const isAlreadyInParty = partyMembers.some(member => member.id === charId);
    if (isAlreadyInParty) {
        alert('そのキャラクターはすでにパーティーにいます。');
        return false;
    }

    slot.innerHTML = '';
    const imgEl = document.createElement('img');
    imgEl.src = char.image;
    imgEl.alt = char.name;
    imgEl.className = 'char-icon';
    slot.appendChild(imgEl);

    slot.dataset.charId = char.id;
    slot.classList.add('filled');

    // Deep copyでキャラクターをパーティーに追加
    const partyChar = JSON.parse(JSON.stringify(char));
    partyMembers.push(partyChar);

    return true;
}

// スロットからキャラクターを削除する関数
function removeCharacterFromSlot(slot) {
    const charIdToRemove = slot.dataset.charId;
    slot.innerHTML = '';
    slot.classList.remove('filled');
    delete slot.dataset.charId;

    partyMembers = partyMembers.filter(member => member.id !== charIdToRemove);
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

// パーティースロット配置イベント（クリック）
partySlotsEl.addEventListener('click', (event) => {
    const slot = event.target.closest('.party-slot');
    if (!slot) return;

    if (selectedCharacterId && !slot.classList.contains('filled')) {
        if (addCharacterToSlot(slot, selectedCharacterId)) {
            selectedCharacterId = null;
            document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
            renderCharacterDetails(null);
        }
    } else if (slot.classList.contains('filled')) {
        removeCharacterFromSlot(slot);
    }
});

// ドラッグ&ドロップイベント
// キャラクターカードのドラッグ開始
characterListEl.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.character-card');
    if (!card) return;
    
    draggedCharacterId = card.dataset.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/html', card.innerHTML);
    card.style.opacity = '0.5';
});

// キャラクターカードのドラッグ終了
characterListEl.addEventListener('dragend', (event) => {
    const card = event.target.closest('.character-card');
    if (card) {
        card.style.opacity = '1';
    }
    draggedCharacterId = null;
});

// パーティースロットのドラッグオーバー
partySlotsEl.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const slot = event.target.closest('.party-slot');
    if (slot) {
        slot.classList.add('highlight');
    }
});

// パーティースロットのドラッグリーブ
partySlotsEl.addEventListener('dragleave', (event) => {
    const slot = event.target.closest('.party-slot');
    if (slot) {
        slot.classList.remove('highlight');
    }
});

// パーティースロットへのドロップ
partySlotsEl.addEventListener('drop', (event) => {
    event.preventDefault();
    const slot = event.target.closest('.party-slot');
    if (!slot || !draggedCharacterId) return;

    slot.classList.remove('highlight');

    // 既にキャラクターがいる場合、一度削除して並び替える
    if (slot.classList.contains('filled')) {
        removeCharacterFromSlot(slot);
    }

    // 新しいキャラクターを配置
    if (addCharacterToSlot(slot, draggedCharacterId)) {
        selectedCharacterId = null;
        document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
        renderCharacterDetails(null);
    }
    draggedCharacterId = null;
});

// パーティー編成データを取得する関数
function getSelectedParty() {
    return partyMembers;
}

// グローバルスコープに公開
window.getSelectedParty = getSelectedParty;

// スキル名ツールチップのイベントハンドラ
function setupSkillTooltips() {
    const detailsContent = document.getElementById('details-content');
    if (!detailsContent) return;

    detailsContent.addEventListener('mouseover', (e) => {
        const skillName = e.target.closest('.skill-name');
        if (!skillName) return;
        
        const tooltip = skillName.nextElementSibling;
        if (tooltip && tooltip.classList.contains('skill-tooltip')) {
            tooltip.style.visibility = 'visible';
            tooltip.style.opacity = '1';
        }
    });

    detailsContent.addEventListener('mouseout', (e) => {
        const skillName = e.target.closest('.skill-name');
        if (!skillName) return;
        
        const tooltip = skillName.nextElementSibling;
        if (tooltip && tooltip.classList.contains('skill-tooltip')) {
            tooltip.style.visibility = 'hidden';
            tooltip.style.opacity = '0';
        }
    });
}

// 初期描画
renderCharacterCards();
renderCharacterDetails(null);
setupSkillTooltips();

// キャラクター詳細が更新されたときにもツールチップハンドラを再設定
const originalRenderCharacterDetails = renderCharacterDetails;
window.renderCharacterDetailsWithTooltips = function(char) {
    originalRenderCharacterDetails(char);
    setupSkillTooltips();
};

// 既存のrenderCharacterDetailsをオーバーライド
renderCharacterDetails = window.renderCharacterDetailsWithTooltips;
