// battle.js

import { sendBattleAction } from './online.js';

const enemyPartyEl = document.getElementById('enemy-party'); // 相手パーティーの要素
const playerPartyEl = document.getElementById('player-party'); // 自分のパーティーの要素
const messageLogEl = document.getElementById('message-log');
const commandAreaEl = document.getElementById('command-area');

let myParty;
let opponentParty;
let activePlayerIndex = 0;
let isMyTurn = true;

// 初期化関数
export function renderBattle(myPartyData, opponentPartyData) {
    myParty = myPartyData.map(p => ({ ...p, status: { ...p.status }, effects: {}, targetMemory: {} }));
    opponentParty = opponentPartyData.map(p => ({ ...p, status: { ...p.status }, effects: {} }));
    
    // プレイヤーと相手のパーティーを描画
    renderPartyDisplay(myParty, playerPartyEl);
    renderPartyDisplay(opponentParty, enemyPartyEl, true);

    logMessage('オンライン対戦開始！', 'special-event');
    startTurn();
}

// パーティーを描画する共通関数
function renderPartyDisplay(party, element, isOpponent = false) {
    element.innerHTML = '';
    party.forEach(char => {
        const charEl = document.createElement('div');
        charEl.className = `character-card ${isOpponent ? 'enemy-character' : 'player-character'}`;
        charEl.dataset.id = char.id;
        charEl.innerHTML = `
            <img src="${char.image}" alt="${char.name}">
            <p class="character-name">${char.name}</p>
            <div class="hp-bar">
                <div class="hp-bar-fill"></div>
            </div>
            <p class="hp-text">${char.status.hp}/${char.status.maxHp}</p>
            <div class="mp-bar">
                <div class="mp-bar-fill"></div>
            </div>
            <p class="mp-text">${char.status.mp}/${char.status.maxMp}</p>
        `;
        element.appendChild(charEl);
    });
}

// ターン開始
async function startTurn() {
    updatePartyDisplays();
    if (isBattleOver()) {
        handleGameOver();
        return;
    }

    if (isMyTurn) {
        logMessage('あなたのターンです！', 'turn');
        selectCommand(activePlayerIndex);
    } else {
        logMessage('相手のターンです...', 'turn');
        commandAreaEl.classList.add('hidden');
        await waitRemoteAction(); // 相手のアクションを待つ
    }
}

// 相手のアクションを待つ
function waitRemoteAction() {
    return new Promise(resolve => {
        // online.jsから呼ばれるグローバル関数として設定
        window.resolveWaitRemoteAction = resolve;
    });
}

// 相手からアクションを受信した時の処理
export async function executeRemoteAction(action) {
    if (action.type === 'attack') {
        const attacker = opponentParty.find(p => p.id === action.attackerId);
        const target = myParty.find(p => p.id === action.targetId);
        await handleAttack(attacker, target, action.isMagic);
    } else if (action.type === 'skill') {
        const attacker = opponentParty.find(p => p.id === action.attackerId);
        const skill = attacker.active.find(s => s.name === action.skillName);
        const target = myParty.find(p => p.id === action.targetId);
        await handleSkill(attacker, skill, target);
    } else if (action.type === 'special') {
        const attacker = opponentParty.find(p => p.id === action.attackerId);
        const special = attacker.special;
        await handleSpecial(attacker, special);
    } else if (action.type === 'end_turn') {
        // 相手がターン終了したことを検知
        isMyTurn = true;
        activePlayerIndex = (activePlayerIndex + 1) % myParty.length;
        while (myParty[activePlayerIndex].status.hp <= 0) {
            activePlayerIndex = (activePlayerIndex + 1) % myParty.length;
        }
        startTurn();
        return; // ターン終了なので、後続のターン処理に進む
    }

    // 相手のアクション実行後、自分のターンへ
    window.resolveWaitRemoteAction();
}

// 攻撃アクションの処理
async function handleAttack(attacker, target, isMagic) {
    const damage = calculateDamage(attacker, target, isMagic);
    target.status.hp = Math.max(0, target.status.hp - damage);
    updatePartyDisplays();
    await new Promise(r => setTimeout(r, 1000));
}

// スキルアクションの処理
async function handleSkill(attacker, skill, target) {
    attacker.status.mp = Math.max(0, attacker.status.mp - skill.mp);
    if (skill.name === 'ヒールライト' || skill.name === '癒しの光') {
        const healAmount = Math.floor(attacker.status.support * 2);
        target.status.hp = Math.min(target.status.maxHp, target.status.hp + healAmount);
        logMessage(`${attacker.name}は「${skill.name}」で${target.name}を${healAmount}回復した！`, 'heal');
    } else if (skill.name === '連撃') {
        // 3回攻撃
        for (let i = 0; i < 3; i++) {
            await handleAttack(attacker, target, false);
            if (target.status.hp <= 0) break;
        }
    } else if (skill.name === 'なぎ払い' || skill.name === 'ブリザード' || skill.name === '虚空の波動') {
        for (const t of myParty) {
            await handleAttack(attacker, t, skill.name === 'ブリザード' || skill.name === '虚空の波動');
        }
    } else if (skill.name === 'シールドバッシュ') {
        const damage = calculateDamage(attacker, target, false);
        target.status.hp = Math.max(0, target.status.hp - damage);
        if (Math.random() < 0.3) {
            logMessage(`${target.name}は行動不能になった！`, 'status-effect');
        }
    } else if (skill.name === '滅気') {
        const damage = calculateDamage(attacker, target, false);
        target.status.hp = Math.max(0, target.status.hp - damage);
        target.effects.extinguishSpirit = { duration: 3, casterId: attacker.id };
        logMessage(`${target.name}に「滅気」の効果がかかった！`, 'status-effect');
    } else if (skill.name === '衰躯') {
        for (const t of myParty) {
            t.effects.fadingBody = { duration: 3 };
            logMessage(`${t.name}に「衰躯」の効果がかかった！`, 'status-effect');
        }
    } else if (skill.name === '呪縛') {
        const damage = calculateDamage(attacker, target, true);
        target.status.hp = Math.max(0, target.status.hp - damage);
        target.effects.curse = { duration: 3, casterId: attacker.id };
        logMessage(`${target.name}に「呪縛」の効果がかかった！`, 'status-effect');
    } else if (skill.name === '深淵の崇拝') {
        const damage = calculateDamage(attacker, target, false);
        target.status.hp = Math.max(0, target.status.hp - damage);
        if (target.effects.abyssian_madness) {
            target.effects.abyssiain_madness.stacks++;
        }
        attacker.effects.abyssal_worship = { casterSupport: attacker.status.support };
        logMessage(`${attacker.name}の「深淵の崇拝」が発動！`, 'status-effect');
    } else if (skill.name === '虚空の波動') {
        for (const t of myParty) {
            t.effects.void = { duration: 3 };
            logMessage(`${t.name}に「虚空」の効果がかかった！`, 'status-effect');
        }
    } else if (skill.name === '血晶の零滴') {
        const damage = calculateDamage(attacker, target, true);
        target.status.hp = Math.max(0, target.status.hp - damage);
        target.effects.blood_crystal_drop = { duration: 3, casterId: attacker.id, casterMatk: attacker.status.matk };
        logMessage(`${target.name}に「血晶の零滴」の効果がかかった！`, 'status-effect');
    } else if (skill.name === 'アビスダンス') {
        const damage = calculateDamage(attacker, target, false);
        target.status.hp = Math.max(0, target.status.hp - damage);
        if (Math.random() < 0.5) {
            target.effects.abyssian_madness = { stacks: 1 };
            logMessage(`${target.name}は「深淵の狂気」に陥った！`, 'status-effect');
        }
    } else {
        const damage = calculateDamage(attacker, target, skill.mp >= 10);
        target.status.hp = Math.max(0, target.status.hp - damage);
    }
    updatePartyDisplays();
    await new Promise(r => setTimeout(r, 1000));
}

// 必殺技の処理
async function handleSpecial(attacker, special) {
    attacker.status.mp = Math.max(0, attacker.status.mp - special.mp);
    if (special.name === '天空斬り' || special.name === 'メテオストライク' || special.name === '聖なる裁き' || special.name === '運命の収束' || special.name === '黒い太陽') {
        const targets = isMyTurn ? opponentParty : myParty;
        for (const t of targets) {
            await handleAttack(attacker, t, special.name === 'メテオストライク' || special.name === '聖なる裁き' || special.name === '運命の収束');
        }
    } else if (special.name === '深淵の書の展開') {
        logMessage(`${attacker.name}は「深淵の書の展開」を発動した！`, 'special-event');
        for (const t of myParty) {
            if (t.effects.abyssian_madness) {
                t.effects.abyssian_madness.stacks++;
            } else {
                t.effects.abyssian_madness = { stacks: 1 };
            }
            logMessage(`${t.name}の狂気スタックが${t.effects.abyssian_madness.stacks}になった。`, 'status-effect');
        }
    }
    updatePartyDisplays();
    await new Promise(r => setTimeout(r, 1000));
}

// プレイヤーのコマンド選択
function selectCommand(playerIndex) {
    const player = myParty[playerIndex];
    const players = document.querySelectorAll('.player-character');

    players.forEach(p => p.classList.remove('active'));
    players[playerIndex].classList.add('active');
    commandAreaEl.classList.remove('hidden');

    updateCommandMenu(player);
}

// コマンドメニューの更新
function updateCommandMenu(player) {
    const commandAreaEl = document.getElementById('command-area');
    commandAreaEl.innerHTML = '';

    const attackButton = document.createElement('button');
    attackButton.textContent = '通常攻撃';
    attackButton.className = 'command-button action-attack';
    attackButton.addEventListener('click', () => selectTarget(player, 'attack'));
    commandAreaEl.appendChild(attackButton);

    player.active.forEach(skill => {
        const skillButton = document.createElement('button');
        skillButton.textContent = skill.name;
        skillButton.className = 'command-button action-skill';
        skillButton.disabled = player.status.mp < skill.mp;
        skillButton.addEventListener('click', () => selectTarget(player, 'skill', skill));
        commandAreaEl.appendChild(skillButton);
    });

    const specialButton = document.createElement('button');
    specialButton.textContent = player.special.name;
    specialButton.className = 'command-button action-special';
    const specialCondition = player.special.condition ? player.special.condition(player) : (player.status.mp >= player.special.mp);
    specialButton.disabled = !specialCondition;
    specialButton.addEventListener('click', () => selectTarget(player, 'special', player.special));
    commandAreaEl.appendChild(specialButton);
}

// ターゲット選択
function selectTarget(player, actionType, actionDetails) {
    const targets = document.querySelectorAll('.enemy-character');
    targets.forEach(targetEl => {
        targetEl.classList.add('selectable');
        targetEl.addEventListener('click', async () => {
            const targetId = targetEl.dataset.id;
            const target = opponentParty.find(p => p.id === targetId);

            if (target) {
                // アクションを自分と相手に適用
                await applyAction(player, target, actionType, actionDetails);

                // アクションを相手に送信
                const actionToSend = {
                    type: actionType,
                    attackerId: player.id,
                    targetId: target.id,
                    isMagic: actionDetails && actionDetails.mp > 0,
                    skillName: actionDetails ? actionDetails.name : null
                };
                sendBattleAction(actionToSend);

                endMyTurn();
            }
        });
    });
}

// アクションを適用する関数
async function applyAction(attacker, target, actionType, actionDetails) {
    if (actionType === 'attack') {
        await handleAttack(attacker, target, false);
    } else if (actionType === 'skill') {
        await handleSkill(attacker, actionDetails, target);
    } else if (actionType === 'special') {
        await handleSpecial(attacker, actionDetails);
    }
}

// 自分のターンを終了
function endMyTurn() {
    isMyTurn = false;
    sendBattleAction({ type: 'end_turn' });
    startTurn();
}

// ダメージ計算関数 (既存のものを流用)
function calculateDamage(attacker, defender, isMagic = false) {
    let actualDodgeRate = defender.status.dodgeRate;
    if (attacker.name === 'きり（ゲーム）' && attacker.targetMemory && attacker.targetMemory.lastTargetId === defender.id && attacker.targetMemory.missed) {
        actualDodgeRate /= 2;
        logMessage(`${attacker.name}の「執着」が発動し、${defender.name}の回避率が半減した！`, 'status-effect');
    }

    if (defender.effects.extinguishSpirit && defender.effects.extinguishSpirit.casterId === attacker.id) {
        actualDodgeRate *= 1.5;
        logMessage(`${attacker.name}の「滅気」効果により、${defender.name}の回避率が上昇した！`, 'status-effect');
    }

    if (Math.random() < actualDodgeRate) {
        logMessage(`${defender.name}は攻撃を回避した！`, 'status-effect');
        if (attacker.name === 'きり（ゲーム）') {
            attacker.targetMemory = { lastTargetId: defender.id, missed: true };
        }
        return 0;
    }
    if (attacker.name === 'きり（ゲーム）' && attacker.targetMemory) {
        attacker.targetMemory = { lastTargetId: null, missed: false };
    }

    let damage;
    if (isMagic) {
        damage = Math.max(1, attacker.status.matk - Math.floor(defender.status.mdef / 2));
    } else {
        damage = Math.max(1, attacker.status.atk - Math.floor(defender.status.def / 2));
    }

    if (attacker.effects.abyssal_worship && defender.effects.abyssian_madness) {
        const damageBoost = attacker.effects.abyssal_worship.casterSupport;
        damage *= damageBoost;
        logMessage(`${attacker.name}の「深淵の崇拝」が発動し、${damageBoost.toFixed(2)}倍のダメージを与えた！`, 'damage');
    }

    if (Math.random() < attacker.status.criticalRate) {
        damage = Math.floor(damage * attacker.status.criticalMultiplier);
        logMessage(`会心の一撃！`, 'special-event');
    }

    logMessage(`${attacker.name}の攻撃！${defender.name}に${damage.toFixed(2)}のダメージ！`, 'damage');
    return damage.toFixed(2);
}

// HP/MP表示の更新
function updatePartyDisplays() {
    updateDisplay(myParty, playerPartyEl);
    updateDisplay(opponentParty, enemyPartyEl);
}

function updateDisplay(party, element) {
    party.forEach((member, index) => {
        const memberEl = element.children[index];
        if (!memberEl) return;

        const hpFill = memberEl.querySelector('.hp-bar-fill');
        const mpFill = memberEl.querySelector('.mp-bar-fill');
        const hpText = memberEl.querySelector('.hp-text');
        const mpText = memberEl.querySelector('.mp-text');

        const hpPercentage = (member.status.hp / member.status.maxHp) * 100;
        const mpPercentage = (member.status.mp / member.status.maxMp) * 100;

        hpFill.style.width = `${hpPercentage}%`;
        mpFill.style.width = `${mpPercentage}%`;
        hpText.textContent = `${member.status.hp}/${member.status.maxHp}`;
        mpText.textContent = `${member.status.mp}/${member.status.maxMp}`;

        if (member.status.hp <= 0) {
            memberEl.classList.add('fainted');
        }
    });
}

// ログ出力
function logMessage(message, type) {
    const p = document.createElement('p');
    p.textContent = message;
    if (type) {
        p.classList.add(`log-message`, type);
    }
    messageLogEl.appendChild(p);
    messageLogEl.scrollTop = messageLogEl.scrollHeight;
}

// 勝敗判定
function isBattleOver() {
    const myAlive = myParty.some(p => p.status.hp > 0);
    const opponentAlive = opponentParty.some(p => p.status.hp > 0);
    return !myAlive || !opponentAlive;
}

// ゲーム終了処理
function handleGameOver() {
    const myAlive = myParty.some(p => p.status.hp > 0);
    if (myAlive) {
        logMessage('🎉 あなたの勝利です！', 'win');
    } else {
        logMessage('😔 あなたの敗北です...', 'lose');
    }
    commandAreaEl.classList.add('hidden');
}