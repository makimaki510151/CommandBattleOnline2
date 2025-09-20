import { enemyData, enemyGroups } from './enemies.js';

const enemyPartyEl = document.getElementById('enemy-party');
const playerPartyEl = document.getElementById('player-party');
const messageLogEl = document.getElementById('message-log');
const commandAreaEl = document.getElementById('command-area');
const battleScreenEl = document.getElementById('battle-screen');
const goButton = document.getElementById('go-button');
const partyScreen = document.getElementById('party-screen');

// 対戦相手の情報と、通信用のデータチャネルを格納する
let opponentParty = [];
let dataChannel = null;

let currentEnemies;
let currentPlayerParty;
let activePlayerIndex = 0;
let currentGroupIndex = 0;

// ダメージ計算関数
function calculateDamage(attacker, defender, isMagic = false) {
    // きり（スタイル）の「執着」効果判定
    let actualDodgeRate = defender.status.dodgeRate;
    if (attacker.name === 'きり（スタイル）' && attacker.targetMemory && attacker.targetMemory.lastTargetId === defender.id && attacker.targetMemory.missed) {
        actualDodgeRate /= 2;
        logMessage(`${attacker.name}の「執着」が発動し、${defender.name}の回避率が半減した！`, 'status-effect');
    }

    // 「滅気」の効果判定
    if (defender.effects.extinguishSpirit && defender.effects.extinguishSpirit.casterId === attacker.id) {
        actualDodgeRate *= 1.5;
        logMessage(`${attacker.name}の「滅気」効果により、${defender.name}の回避率が上昇した！`, 'status-effect');
    }

    // 回避判定
    if (Math.random() < actualDodgeRate) {
        logMessage(`${defender.name}は攻撃を回避した！`, 'status-effect');
        // 攻撃が外れた場合、きり（スタイル）の執着フラグを立てる
        if (attacker.name === 'きり（スタイル}') {
            attacker.targetMemory = { lastTargetId: defender.id, missed: true };
        }
        return 0;
    }

    // 攻撃が当たった場合、執着フラグをリセット
    if (attacker.name === 'きり（スタイル）' && attacker.targetMemory) {
        attacker.targetMemory = { lastTargetId: null, missed: false };
    }

    let damage;
    if (isMagic) {
        damage = Math.max(1, attacker.status.matk - Math.floor(defender.status.mdef / 2));
    } else {
        damage = Math.max(1, attacker.status.atk - Math.floor(defender.status.def / 2));
    }

    // 「深淵の崇拝」の効果判定
    if (attacker.effects.abyssal_worship && defender.effects.abyssian_madness) {
        const damageBoost = attacker.effects.abyssal_worship.casterSupport;
        damage *= damageBoost;
        logMessage(`${attacker.name}の「深淵の崇拝」が発動し、${damageBoost.toFixed(2)}倍のダメージを与えた！`, 'damage');
    }

    // 会心判定
    if (Math.random() < attacker.status.criticalRate) {
        damage = Math.floor(damage * attacker.status.criticalMultiplier);
        logMessage(`会心の一撃！`, 'special-event');
    }

    logMessage(`${attacker.name}の攻撃！${defender.name}に${damage.toFixed(2)}のダメージ！`, 'damage');
    return parseFloat(damage.toFixed(2));
}

// 敵キャラクターの更新
function updateEnemyDisplay() {
    currentEnemies.forEach((enemy, index) => {
        const enemyEl = enemyPartyEl.children[index];
        const hpFill = enemyEl.querySelector('.hp-bar-fill');
        const hpPercentage = (enemy.status.hp / enemy.status.maxHp) * 100;
        hpFill.style.width = `${hpPercentage}%`;

        const hpText = enemyEl.querySelector('.hp-text');
        if (hpText) {
            hpText.textContent = `${enemy.status.hp}/${enemy.status.maxHp}`;
        }

        if (enemy.status.hp <= 0) {
            enemyEl.classList.add('fainted');
        }
    });
}

// 味方キャラクターの更新
function updatePlayerDisplay() {
    currentPlayerParty.forEach((player, index) => {
        const playerEl = playerPartyEl.children[index];
        const hpFill = playerEl.querySelector('.hp-bar-fill');
        const mpFill = playerEl.querySelector('.mp-bar-fill');

        const hpPercentage = (player.status.hp / player.status.maxHp) * 100;
        const mpPercentage = (player.status.mp / player.status.maxMp) * 100;

        hpFill.style.width = `${hpPercentage}%`;
        mpFill.style.width = `${mpPercentage}%`;

        const hpText = playerEl.querySelector('.hp-text');
        const mpText = playerEl.querySelector('.mp-text');
        if (hpText) {
            hpText.textContent = `${player.status.hp}/${player.status.maxHp}`;
        }
        if (mpText) {
            mpText.textContent = `${player.status.mp}/${player.status.maxMp}`;
        }

        if (player.status.hp <= 0) {
            playerEl.classList.add('fainted');
        }
    });
}

// ★ P2P通信用の startBattle 関数に変更
window.startBattle = async (channel) => {
    dataChannel = channel;
    logMessage('戦闘開始！');
    currentPlayerParty = window.getSelectedParty();
    currentEnemies = opponentParty; // 敵パーティーを相手プレイヤーのパーティーに置き換え

    // プレイヤーと敵に状態管理用オブジェクトを追加
    currentPlayerParty.forEach(p => {
        p.effects = {};
        if (p.id === 'char06') {
            p.targetMemory = { lastTargetId: null, missed: false };
        }
    });

    // 相手からのメッセージを待機
    dataChannel.on('data', data => {
        const message = JSON.parse(data);
        handleOpponentAction(message);
    });

    // 相手が切断した場合の処理
    dataChannel.on('close', () => {
        logMessage('相手プレイヤーが切断しました。');
        handleGameWin();
    });

    // 初期描画
    renderBattle();
    
    // 戦闘開始のメッセージを送信し、自分のパーティー情報を相手に送る
    dataChannel.send(JSON.stringify({
        type: 'battle_start',
        party: currentPlayerParty
    }));

    // 戦闘開始時に相手のパーティー情報を受け取るまで待つ
    const receivedInitialData = await new Promise(resolve => {
        dataChannel.on('data', message => {
            const data = JSON.parse(message);
            if (data.type === 'battle_start') {
                opponentParty = data.party;
                currentEnemies = opponentParty;
                logMessage('相手パーティーの情報を受信しました。');
                renderBattle(); // 相手パーティーを描画
                resolve();
            }
        });
    });

    // 両者が準備完了したら、ターンを開始
    // ここでは、ホスト側（接続待ち側）が最初のターンを開始
    if (dataChannel.open && dataChannel.remoteId < dataChannel.localId) { // IDでどちらが先攻か決める
        await playerTurn(currentPlayerParty[0]);
    } else {
        logMessage('相手のターンを待っています...');
        // 相手からの行動メッセージを待機
    }

};

// 相手からの行動を処理する関数
function handleOpponentAction(message) {
    if (message.type === 'action') {
        const player = opponentParty.find(p => p.id === message.payload.performerId);
        const target = currentPlayerParty.find(p => p.id === message.payload.targetId);

        if (!player || !target) {
            console.error('無効な行動データを受信しました。');
            return;
        }

        logMessage(`${player.name}のターン！`);
        let actionResult;

        switch (message.payload.actionType) {
            case 'attack':
                actionResult = performAttack(player, target);
                break;
            case 'skill':
                // スキルの処理
                const skill = player.active.find(s => s.name === message.payload.skillName);
                if (skill) {
                    performSkill(skill, player, target);
                }
                break;
            case 'special':
                // 必殺技の処理
                const specialSkill = player.special;
                if (specialSkill && specialSkill.name === message.payload.skillName) {
                    performSpecial(specialSkill, player, target);
                }
                break;
            case 'defend':
                logMessage(`${player.name}は防御した。`);
                break;
            default:
                logMessage('未知の行動を受信しました。');
                break;
        }

        // 呪縛の効果判定
        if (player.effects.curse && actionResult > 0) {
            const curseDamage = Math.floor(player.status.maxHp * 0.05);
            player.status.hp = Math.max(0, player.status.hp - curseDamage);
            logMessage(`${player.name}は「呪縛」で${curseDamage}のダメージを受けた！`, 'damage');
        }

        updatePlayerDisplay();
    }
}


// 味方ターンの処理 (P2P用に変更)
function playerTurn(player) {
    return new Promise(resolve => {
        logMessage(`${player.name}のターン！`);
        selectCommand(currentPlayerParty.indexOf(player));

        commandAreaEl.onclick = async (event) => {
            const targetEl = event.target;
            let actionData = null;

            if (targetEl.classList.contains('action-attack')) {
                logMessage('対象を選んでください。');
                const enemySelection = await selectEnemyTarget();
                if (enemySelection) {
                    actionData = { actionType: 'attack', performerId: player.id, targetId: enemySelection.id };
                }
            } else if (targetEl.classList.contains('action-skill')) {
                const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
                skillMenuEl.classList.toggle('hidden');
            } else if (targetEl.classList.contains('skill-button')) {
                const skillName = targetEl.textContent;
                const skill = player.active.find(s => s.name === skillName);
                if (skill) {
                    // MP消費の判定
                    let mpCost = skill.mp;
                    if (player.effects.curse) {
                        mpCost = Math.floor(mpCost * 1.5);
                    }
                    if (player.status.mp < mpCost) {
                        logMessage(`MPが足りません！`);
                        return;
                    }
                    player.status.mp -= mpCost;

                    let target;
                    if (skill.targetType === 'single-enemy') {
                        logMessage('攻撃する敵を選択してください。');
                        target = await selectEnemyTarget();
                    } else if (skill.targetType === 'single-player') {
                        logMessage('回復する味方を選択してください。');
                        target = await selectPlayerTarget();
                    } else if (skill.targetType === 'all-enemy') {
                        target = currentEnemies;
                    } else if (skill.targetType === 'all-player') {
                        target = currentPlayerParty;
                    }

                    if (target) {
                        actionData = { actionType: 'skill', performerId: player.id, skillName: skill.name, targetId: target.id };
                    }
                }
            } else if (targetEl.classList.contains('action-special')) {
                const specialSkill = player.special;
                if (specialSkill && specialSkill.condition && specialSkill.condition(player)) {
                    if (player.status.mp < specialSkill.mp) {
                        logMessage(`MPが足りません！`);
                        return;
                    }
                    player.status.mp -= specialSkill.mp;
                    actionData = { actionType: 'special', performerId: player.id, skillName: specialSkill.name };
                } else {
                    logMessage('必殺技の条件を満たしていません。');
                }
            } else if (targetEl.classList.contains('action-defend')) {
                actionData = { actionType: 'defend', performerId: player.id };
            }

            if (actionData) {
                // アクションを相手に送信
                dataChannel.send(JSON.stringify({
                    type: 'action',
                    payload: actionData
                }));
                // ローカルでアクションを実行
                performLocalAction(actionData, player);
                commandAreaEl.classList.add('hidden');
                commandAreaEl.onclick = null;
                resolve();
            }
        };
    });
}

// ローカルでのアクション実行
function performLocalAction(actionData, player) {
    const { actionType, skillName, targetId } = actionData;

    switch (actionType) {
        case 'attack':
            const targetEnemy = currentEnemies.find(e => e.id === targetId);
            performAttack(player, targetEnemy);
            break;
        case 'skill':
            const skill = player.active.find(s => s.name === skillName);
            if (!skill) return;

            if (skill.name === 'ヒールライト') {
                const targetPlayer = currentPlayerParty.find(p => p.id === targetId);
                performHeal(player, targetPlayer);
            } else if (skill.name === '連撃') {
                const targetEnemy = currentEnemies.find(e => e.id === targetId);
                performMultiAttack(player, targetEnemy);
            } else if (skill.name === 'なぎ払い' || skill.name === 'ブリザード') {
                performAreaAttack(player, currentEnemies);
            } else if (skill.name === '蠱惑の聖歌') {
                performSanctuaryHymn(player);
            } else if (skill.name === '深淵の理路') {
                performAbyssalLogic(player);
            } else if (skill.name === '血晶の零滴') {
                const targetEnemy = currentEnemies.find(e => e.id === targetId);
                performBloodCrystalDrop(player, targetEnemy);
            } else if (skill.name === '滅気') {
                const targetEnemy = currentEnemies.find(e => e.id === targetId);
                performExtinguishSpirit(player, targetEnemy);
            } else if (skill.name === '衰躯') {
                performFadingBody(player, currentEnemies);
            } else if (skill.name === '呪縛') {
                const targetEnemy = currentEnemies.find(e => e.id === targetId);
                performCurse(player, targetEnemy);
            } else if (skill.name === '虚空') {
                performVoid(player, currentEnemies);
            }
            break;
        case 'special':
            if (skillName === '狂気の再編') {
                performMadnessReorganization(player);
            } else if (skillName === '虚空') {
                performVoid(player, currentEnemies);
            }
            break;
        case 'defend':
            logMessage(`${player.name}は防御した。`);
            break;
    }
    updatePlayerDisplay();
    updateEnemyDisplay();
}

// 敵ターンの処理 (P2Pのため不要)
// function enemyTurn(enemy) { ... }

// ターゲット選択ロジック（敵）
function selectEnemyTarget() {
    return new Promise(resolve => {
        const enemyEls = document.querySelectorAll('.enemy-character');
        enemyEls.forEach((el, index) => {
            if (currentEnemies[index].status.hp > 0) {
                el.classList.add('selectable');
                el.onclick = () => {
                    enemyEls.forEach(e => e.classList.remove('selectable'));
                    resolve(currentEnemies[index]);
                };
            }
        });
    });
}

// ターゲット選択ロジック（味方）
function selectPlayerTarget() {
    return new Promise(resolve => {
        const playerEls = document.querySelectorAll('.player-character');
        playerEls.forEach((el, index) => {
            if (currentPlayerParty[index].status.hp > 0) {
                el.classList.add('selectable');
                el.onclick = () => {
                    playerEls.forEach(e => e.classList.remove('selectable'));
                    resolve(currentPlayerParty[index]);
                };
            }
        });
    });
}

// 攻撃アクション
function performAttack(attacker, target) {
    const damage = calculateDamage(attacker, target, attacker.attackType === 'magic');
    target.status.hp = Math.max(0, target.status.hp - damage);
    updateEnemyDisplay();
    return damage;
}

// 複数回攻撃アクション
function performMultiAttack(attacker, target) {
    const attacks = 3;
    let totalDamage = 0;
    for (let i = 0; i < attacks; i++) {
        const damage = calculateDamage(attacker, target, attacker.attackType === 'magic');
        target.status.hp = Math.max(0, target.status.hp - damage);
        totalDamage += damage;
        if (target.status.hp <= 0) break;
    }
    updateEnemyDisplay();
}

// 全体攻撃アクション
function performAreaAttack(attacker, targets) {
    targets.forEach(target => {
        if (target.status.hp > 0) {
            const damage = calculateDamage(attacker, target, attacker.attackType === 'magic');
            target.status.hp = Math.max(0, target.status.hp - damage);
        }
    });
    updateEnemyDisplay();
}

// 回復アクション
function performHeal(healer, target) {
    const healAmount = healer.status.support * 2;
    logMessage(`${healer.name}は${target.name}を${healAmount}回復した。`, 'heal');
    target.status.hp = Math.min(target.status.maxHp, target.status.hp + healAmount);
    updatePlayerDisplay();
}

// 「蠱惑の聖歌」の実装
function performSanctuaryHymn(caster) {
    const healAmount = Math.floor(caster.status.support * 0.5);
    currentPlayerParty.forEach(p => {
        p.status.hp = Math.min(p.status.maxHp, p.status.hp + healAmount);
        p.effects.abyssal_worship = { duration: 5, casterSupport: caster.status.support / 60 };
        logMessage(`${p.name}は「深淵の崇拝」の効果を得た！`, 'status-effect');
    });
    updatePlayerDisplay();
}

// 「深淵の理路」の実装
function performAbyssalLogic(caster) {
    currentEnemies.forEach(enemy => {
        if (enemy.effects.abyssal_echo) {
            logMessage(`${enemy.name}には「深淵の残響」が付与されているため、「深淵の狂気」を付与できません。`);
            return;
        }

        if (!enemy.effects.abyssian_madness) {
            enemy.effects.abyssian_madness = { stacks: 1, duration: 5 };
            logMessage(`${enemy.name}は「深淵の狂気」状態になった！`, 'status-effect');
        } else {
            enemy.effects.abyssian_madness.stacks++;
            enemy.effects.abyssian_madness.duration = 5;
            logMessage(`${enemy.name}の「深淵の狂気」スタックが${enemy.effects.abyssian_madness.stacks}になった。`, 'status-effect');
        }
    });
}

// 「血晶の零滴」の実装
function performBloodCrystalDrop(caster, target) {
    target.effects.blood_crystal_drop = { duration: 3, casterMatk: caster.status.matk, casterId: caster.id };
    logMessage(`${target.name}は「血晶の零滴」状態になった。`, 'status-effect');
}

// 「狂気の再編」の実装
function performMadnessReorganization(caster) {
    const targets = currentEnemies.filter(e => e.effects.abyssian_madness && e.effects.abyssian_madness.stacks >= 5);

    if (targets.length === 0) {
        logMessage('必殺技の条件を満たす敵がいません。');
        return;
    }

    targets.forEach(target => {
        const stacks = target.effects.abyssian_madness.stacks;
        const baseDamage = Math.floor(caster.status.matk * stacks);
        const damage = Math.max(1, baseDamage - Math.floor(target.status.mdef / 2));

        target.status.hp = Math.max(0, target.status.hp - damage);
        logMessage(`${target.name}に「狂気の再編」で${damage}のダメージ！`, 'damage');

        delete target.effects.abyssian_madness;
        target.effects.abyssal_echo = { stacks: 5, disableChance: 0.5 };
        logMessage(`${target.name}に「深淵の残響」が付与された。`, 'status-effect');
    });

    updateEnemyDisplay();
}

// 「滅気」の実装
function performExtinguishSpirit(caster, target) {
    if (!target.effects.extinguishSpirit || target.effects.extinguishSpirit.casterId !== caster.id) {
        target.effects.extinguishSpirit = { duration: 3, casterId: caster.id };
        logMessage(`${target.name}は「滅気」状態になった！`, 'status-effect');
    } else {
        target.effects.extinguishSpirit.duration = 3;
        logMessage(`${target.name}の「滅気」効果がリフレッシュされた。`, 'status-effect');
    }
}

// 「衰躯」の実装
function performFadingBody(caster, targets) {
    targets.forEach(target => {
        if (!target.effects.fadingBody) {
            target.effects.fadingBody = { duration: 3, debuffAmount: 0.25 };
            logMessage(`${target.name}は「衰躯」状態になった！`, 'status-effect');
        } else {
            target.effects.fadingBody.duration = 3;
            logMessage(`${target.name}の「衰躯」効果がリフレッシュされた。`, 'status-effect');
        }
    });
}

// 「呪縛」の実装
function performCurse(caster, target) {
    if (!target.effects.curse) {
        target.effects.curse = { duration: 5, casterId: caster.id };
        logMessage(`${target.name}は「呪縛」状態になった！`, 'status-effect');
    } else {
        target.effects.curse.duration = 5;
        logMessage(`${target.name}の「呪縛」効果がリフレッシュされた。`, 'status-effect');
    }
}

// 「虚空」の実装
function performVoid(caster, targets) {
    targets.forEach(target => {
        let debuffCount = Object.keys(target.effects).length;
        if (target.effects.void) debuffCount--;

        let duration = Math.max(1, debuffCount * 2);

        target.effects.void = { duration: duration };
        logMessage(`${target.name}は「虚空」状態になった！ 効果時間: ${duration}ターン`, 'status-effect');
    });
}

// 戦闘終了判定
function isBattleOver() {
    const playersAlive = currentPlayerParty.some(p => p.status.hp > 0);
    const enemiesAlive = currentEnemies.some(e => e.status.hp > 0);
    return !playersAlive || !enemiesAlive;
}

// ゲーム勝利処理
function handleGameWin() {
    logMessage('相手に勝利しました！');
    logMessage('ゲームクリア！おめでとうございます！');
    dataChannel.send(JSON.stringify({ type: 'game_over', result: 'lose' }));
    resetGame();
}

// ゲームオーバー処理
function handleGameOver() {
    logMessage('全滅しました... ゲームオーバー');
    dataChannel.send(JSON.stringify({ type: 'game_over', result: 'win' }));
    resetGame();
}

function resetGame() {
    commandAreaEl.innerHTML = '';
    goButton.disabled = false;
    battleScreenEl.classList.add('hidden');
    partyScreen.classList.remove('hidden');
}


// コマンドメニューのテンプレートを生成
function createCommandMenu() {
    return `
        <div class="commands">
            <button class="command-button action-attack">こうげき</button>
            <button class="command-button action-skill">とくぎ</button>
            <div class="skill-menu hidden"></div>
            <button class="command-button action-special hidden">ひっさつ</button>
            <button class="command-button action-defend">ぼうぎょ</button>
        </div>
    `;
}

// 戦闘画面を描画する関数
function renderBattle() {
    // 敵パーティー（相手プレイヤー）の描画
    enemyPartyEl.innerHTML = '';
    currentEnemies.forEach(enemy => {
        const enemyDiv = document.createElement('div');
        enemyDiv.className = 'enemy-character';
        enemyDiv.dataset.charId = enemy.id;
        enemyDiv.innerHTML = `
            <img src="${enemy.image}" alt="${enemy.name}">
            <p>${enemy.name}</p>
            <div class="hp-bar"><div class="hp-bar-fill" style="width: 100%;"></div></div>
            <p class="hp-text">${enemy.status.hp}/${enemy.status.maxHp}</p>
            <div class="mp-bar"><div class="mp-bar-fill" style="width: 100%;"></div></div>
            <p class="mp-text">${enemy.status.mp}/${enemy.status.maxMp}</p>
        `;
        enemyPartyEl.appendChild(enemyDiv);
    });

    // 味方パーティーの描画
    playerPartyEl.innerHTML = '';
    currentPlayerParty.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-character';
        playerDiv.dataset.charId = player.id;
        playerDiv.innerHTML = `
            <img src="${player.image}" alt="${player.name}">
            <p>${player.name}</p>
            <div class="hp-bar"><div class="hp-bar-fill" style="width: 100%;"></div></div>
            <p class="hp-text">${player.status.hp}/${player.status.maxHp}</p>
            <div class="mp-bar"><div class="mp-bar-fill" style="width: 100%;"></div></div>
            <p class="mp-text">${player.status.mp}/${player.status.maxMp}</p>
        `;
        playerPartyEl.appendChild(playerDiv);
    });

    commandAreaEl.innerHTML = createCommandMenu();
}

function logMessage(message, type = '') {
    const p = document.createElement('p');
    p.textContent = message;
    if (type) {
        p.classList.add(`log-message`, type);
    }
    messageLogEl.appendChild(p);
    messageLogEl.scrollTop = messageLogEl.scrollHeight;
}

// キャラクターにコマンド選択を促す関数
function selectCommand(playerIndex) {
    const players = document.querySelectorAll('.player-character');
    const partyMembers = window.getSelectedParty();

    players.forEach(p => p.classList.remove('active'));
    players[playerIndex].classList.add('active');
    commandAreaEl.classList.remove('hidden');

    updateCommandMenu(partyMembers[playerIndex]);
}

// コマンドメニューの更新（特技と必殺技の表示・非表示を制御）
function updateCommandMenu(player) {
    const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
    const specialButtonEl = commandAreaEl.querySelector('.action-special');

    skillMenuEl.innerHTML = player.active.map(skill => {
        return `<button class="skill-button">${skill.name}</button>`;
    }).join('');

    if (player.id === 'char06') {
        player.special.condition = (p) => {
            return currentEnemies.some(e => Object.keys(e.effects).length >= 2);
        };
    }

    if (player.special.condition && player.special.condition(player)) {
        specialButtonEl.classList.remove('hidden');
    } else {
        specialButtonEl.classList.add('hidden');
    }
}