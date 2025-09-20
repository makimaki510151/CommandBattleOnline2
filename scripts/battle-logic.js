// battle-logic.js

// ダメージ計算関数
export function calculateDamage(attacker, defender, isMagic = false) {
    const atk = isMagic ? attacker.status.matk : attacker.status.atk;
    const def = isMagic ? defender.status.mdef : defender.status.def;
    const damage = Math.max(0, atk - def / 2) + Math.floor(Math.random() * 10);
    return damage;
}

// 攻撃アクション
export function performAttack(attacker, defender) {
    const damage = calculateDamage(attacker, defender);
    defender.status.hp = Math.max(0, defender.status.hp - damage);
    logMessage(`${attacker.name}の攻撃！ ${defender.name}に${damage}のダメージ！`);
}

// スキルアクション
export function performSkill(caster, targets, allies, skill, targetIndex) {
    logMessage(`${caster.name}が「${skill.name}」を発動！`);
    if (skill.target === 'single') {
        const target = targets[targetIndex];
        const damage = calculateDamage(caster, target, skill.attackType === 'magic');
        target.status.hp = Math.max(0, target.status.hp - damage);
        logMessage(`${target.name}に${damage}のダメージ！`);
    } else if (skill.target === 'all') {
        targets.forEach(target => {
            const damage = calculateDamage(caster, target, skill.attackType === 'magic');
            target.status.hp = Math.max(0, target.status.hp - damage);
            logMessage(`${target.name}に${damage}のダメージ！`);
        });
    }
}

// 勝利条件チェック
export function checkWinCondition(playerParty, opponentParty) {
    const playerLost = playerParty.every(char => char.status.hp <= 0);
    const opponentLost = opponentParty.every(char => char.status.hp <= 0);
    if (playerLost) {
        logMessage('あなたの負けです...', 'system');
        // 終了処理は別途実装
    } else if (opponentLost) {
        logMessage('あなたの勝利です！', 'system');
        // 終了処理は別途実装
    }
}

// ログメッセージの表示
export function logMessage(message, type) {
    const messageLogEl = document.getElementById('message-log');
    const p = document.createElement('p');
    p.textContent = message;
    if (type) {
        p.classList.add(`log-message`, type);
    }
    messageLogEl.appendChild(p);
    messageLogEl.scrollTop = messageLogEl.scrollHeight;
}