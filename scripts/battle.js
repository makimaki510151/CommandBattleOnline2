export { startBattle, handleOpponentParty, performAttackOnline, calculateDamage, updateEnemyDisplay, updatePlayerDisplay, logMessage, selectCommand, isBattleOver, handleBattleEnd, renderBattle };

import { enemyData, enemyGroups } from './enemies.js';

const enemyPartyEl = document.getElementById('enemy-party');
const playerPartyEl = document.getElementById('player-party');
const messageLogEl = document.getElementById('message-log');
const commandAreaEl = document.getElementById('command-area');
const battleScreenEl = document.getElementById('battle-screen');
const goButton = document.getElementById('go-button');
const partyScreen = document.getElementById('party-screen');

let currentEnemies;
let currentPlayerParty;
let opponentParty; // オンライン対戦時の相手パーティー
let activePlayerIndex = 0;
let currentGroupIndex = 0;
let currentTurn = 0; // ターン管理用
let waitingForOpponent = false; // 相手の行動待ち
let isBattleOngoing = false; // 修正点: この行を追加

window.currentPlayerParty = currentPlayerParty;
window.opponentParty = opponentParty;

// ダメージ計算関数
function calculateDamage(attacker, defender, isMagic = false) {
    // 状態異常による回避率の変動
    let actualDodgeRate = defender.status.dodgeRate;
    let specialEffectLog = '';

    // きり（ゲーム）の「執着」効果判定
    if (attacker.name === 'きり（ゲーム）' && attacker.targetMemory && attacker.targetMemory.lastTargetId === defender.id && attacker.targetMemory.missed) {
        actualDodgeRate /= 2;
        specialEffectLog += `${attacker.name}の「執着」が発動し、${defender.name}の回避率が半減した！`;
    }

    // 「滅気」の効果判定
    if (defender.effects.extinguishSpirit && defender.effects.extinguishSpirit.casterId === attacker.id) {
        actualDodgeRate *= 1.5;
        specialEffectLog += `${attacker.name}の「滅気」効果により、${defender.name}の回避率が上昇した！`;
    }

    // 回避判定
    const dodged = Math.random() < actualDodgeRate;

    // 攻撃が当たった場合の処理
    let damage = 0;
    let critical = false;
    if (!dodged) {
        if (isMagic) {
            damage = Math.max(1, attacker.status.matk - Math.floor(defender.status.mdef / 2));
        } else {
            damage = Math.max(1, attacker.status.atk - Math.floor(defender.status.def / 2));
        }

        // 「深淵の崇拝」の効果判定
        if (attacker.effects.abyssal_worship && defender.effects.abyssian_madness) {
            const damageBoost = attacker.effects.abyssal_worship.casterSupport;
            damage *= damageBoost;
            specialEffectLog += `${attacker.name}の「深淵の崇拝」が発動し、${damageBoost.toFixed(2)}倍のダメージを与えた！`;
        }

        // 会心判定
        critical = Math.random() < attacker.status.criticalRate;
        if (critical) {
            damage = Math.floor(damage * attacker.status.criticalMultiplier);
        }
    }

    // きり（ゲーム）の執着フラグを更新
    if (attacker.name === 'きり（ゲーム）') {
        attacker.targetMemory = { lastTargetId: defender.id, missed: dodged };
    }

    // 以下の部分は、ホストのみが実行し、結果をまとめて送信する
    if (window.isOnlineMode() && window.isHost()) {
        window.sendData({
            type: 'battle_result',
            action: 'attack',
            attackerId: attacker.id,
            defenderId: defender.id,
            damage: damage,
            dodged: dodged,
            critical: critical,
            specialEffectLog: specialEffectLog,
        });
    }

    return damage;
}

// 敵キャラクターの更新
function updateEnemyDisplay() {
    const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
    if (!enemies) return;

    enemies.forEach((enemy, index) => {
        if (enemyPartyEl.children[index]) {
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
        }
    });
}

// 味方キャラクターの更新
function updatePlayerDisplay() {
    if (!currentPlayerParty) return; // 安全性チェックを追加

    currentPlayerParty.forEach((player, index) => {
        if (playerPartyEl.children[index]) {
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
        }
    });
}

window.setCurrentPlayerParty = function (party) {
    currentPlayerParty = party;
    // パーティーに状態管理用オブジェクトを追加
    currentPlayerParty.forEach(p => {
        p.effects = {};
        if (p.id === 'char06') {
            p.targetMemory = { lastTargetId: null, missed: false };
        }
    });
};

let myPartyReady = false;
let opponentPartyReady = false;

async function startBattle(partyMembers) {
    logMessage('戦闘開始！');

    // 自分のパーティーデータを設定
    currentPlayerParty = partyMembers;
    window.currentPlayerParty = partyMembers; // 🔴 追加: グローバルスコープにパーティーデータを設定
    myPartyReady = true;

    // プレイヤーに状態管理用オブジェクトを追加
    currentPlayerParty.forEach(p => {
        p.effects = {};
        if (p.id === 'char06') {
            p.targetMemory = { lastTargetId: null, missed: false };
        }
    });

    if (window.isOnlineMode()) {
        logMessage('オンライン対戦を開始します！');

        // 自分のパーティー情報を相手に送信
        window.sendData({
            type: 'party_data',
            party: currentPlayerParty
        });

        logMessage('相手のパーティー情報を待機中...');

        // 自分のパーティーと相手のパーティーが両方準備完了していれば描画
        if (opponentPartyReady) {
            renderBattle();
            if (window.isHost()) {
                logMessage('戦闘を開始します！');
                window.sendData({ type: 'start_battle' });
                battleLoop();
            }
        }
    } else {
        // シングルプレイモード
        currentGroupIndex = 0;
        await startNextGroup();
    }
}


function handleOpponentParty(partyData) {
    // データが有効かチェック
    if (!partyData) {
        console.error('Received empty party data. Aborting handleOpponentParty.');
        return;
    }

    opponentParty = partyData;
    opponentPartyReady = true;
    logMessage('相手のパーティー情報を受信しました！');

    // 自分のパーティーと相手のパーティーが両方準備完了していれば描画
    if (myPartyReady) {
        renderBattle();
    }

    // 重要な修正点: ホストであり、かつ両方のパーティーが設定されているか確認してから戦闘を開始
    if (window.isOnlineMode() && window.isHost() && myPartyReady && opponentPartyReady) {
        logMessage('戦闘を開始します！');
        // クライアントに戦闘開始を通知
        window.sendData({ type: 'start_battle' });
        // ホスト自身も戦闘ループを開始
        battleLoop();
    }
}

window.startBattleClientSide = function () {
    // 修正点: 変数定義をファイル冒頭に移動したので、ここでは変数に関する変更は不要
    if (isBattleOngoing) return;
    logMessage('ホストが戦闘を開始しました。行動を待機中...');
    isBattleOngoing = true;
    renderBattle();
};

// オンライン対戦用のプレイヤーターン
window.playerTurnOnline = function (player) {
    return new Promise(resolve => {
        // currentPlayerPartyの存在確認
        if (!currentPlayerParty || !Array.isArray(currentPlayerParty)) {
            logMessage('パーティーデータが正しく設定されていません。');
            resolve();
            return;
        }

        const activePlayer = player;
        const playerIndex = currentPlayerParty.indexOf(activePlayer);
        window.activePlayerIndex = playerIndex; // グローバル変数に設定

        logMessage(`${activePlayer.name}のターン！`);
        // selectCommandは引数を取らずに、グローバルな activePlayerIndex を参照するように変更
        selectCommand();

        const handleCommand = async (event) => {
            const target = event.target;
            let actionTaken = false;
            let actionData = null;

            if (target.classList.contains("action-attack")) {
                logMessage("対象を選んでください。");
                const targetIndex = await selectEnemyTargetOnline();
                if (targetIndex !== null) {
                    actionData = {
                        type: "battle_action",
                        action: "attack",
                        actorId: activePlayer.id,
                        targetIndex: targetIndex,
                        turn: currentTurn
                    };
                    actionTaken = true;
                }
            } else if (target.classList.contains('action-skill')) {
                const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
                skillMenuEl.classList.toggle('hidden');
            } else if (target.classList.contains('skill-button')) {
                const skillName = target.textContent;
                const skill = activePlayer.active.find(s => s.name === skillName);
                if (skill) {
                    let mpCost = skill.mp;
                    if (activePlayer.effects.curse) {
                        mpCost = Math.floor(mpCost * 1.5);
                        logMessage(`${activePlayer.name}の「呪縛」により、MP消費が${mpCost}に増加した。`);
                    }

                    if (activePlayer.status.mp < mpCost) {
                        logMessage(`MPが足りません！`);
                        return;
                    }

                    actionData = await executeSkillOnline(activePlayer, skill);
                    if (actionData) {
                        actionData.turn = currentTurn;
                        actionTaken = true;
                    }
                }
            } else if (target.classList.contains('action-special')) {
                const specialSkill = activePlayer.special;
                if (specialSkill && specialSkill.condition && specialSkill.condition(activePlayer)) {
                    if (activePlayer.status.mp < specialSkill.mp) {
                        logMessage(`MPが足りません！`);
                        return;
                    }

                    actionData = await executeSkillOnline(activePlayer, specialSkill);
                    if (actionData) {
                        actionData.turn = currentTurn;
                        actionTaken = true;
                    }
                } else {
                    logMessage('必殺技の条件を満たしていません。');
                }
            } else if (target.classList.contains('action-defend')) {
                logMessage(`${activePlayer.name}は防御した。`);
                actionData = { type: "battle_action", action: "defend", actorId: activePlayer.id, turn: currentTurn };
                actionTaken = true;
            }

            if (actionTaken && actionData) {
                window.sendData(actionData);
                commandAreaEl.removeEventListener('click', handleCommand);
                commandAreaEl.classList.add("hidden");
                resolve();
            }
        };

        commandAreaEl.addEventListener('click', handleCommand);
    });
};

// オンライン対戦用の攻撃処理
function performAttackOnline(attacker, target) {
    const damage = calculateDamage(attacker, target, attacker.attackType === 'magic');
    target.status.hp = Math.max(0, target.status.hp - damage);
    updateEnemyDisplay();
}

// オンライン対戦用の敵選択
function selectEnemyTargetOnline() {
    return new Promise(resolve => {
        if (!opponentParty || !Array.isArray(opponentParty)) {
            resolve(null);
            return;
        }

        const enemies = opponentParty.filter(e => e.status.hp > 0);
        if (enemies.length === 0) {
            resolve(null);
            return;
        }

        renderEnemySelection(enemies);

        enemyPartyEl.onclick = (event) => {
            const targetEl = event.target.closest(".enemy-character");
            if (targetEl) {
                const targetId = targetEl.dataset.enemyId;
                const targetIndex = opponentParty.findIndex(e => e.id === targetId);
                if (targetIndex !== -1 && opponentParty[targetIndex].status.hp > 0) {
                    enemyPartyEl.querySelectorAll(".enemy-character").forEach(el => el.classList.remove("selected-target"));
                    resolve(targetIndex);
                }
            }
        };
    });
}

// 次の敵グループとの戦闘を開始する（シングルプレイ用）
async function startNextGroup() {
    if (currentGroupIndex >= enemyGroups.length) {
        handleGameWin();
        return;
    }

    const group = enemyGroups[currentGroupIndex];
    logMessage(`${group.name}との戦闘！`);

    currentEnemies = group.enemies.map(enemyId => {
        const enemy = enemyData.find(e => e.id === enemyId);
        return { ...enemy, status: { ...enemy.status }, effects: {} };
    });

    renderBattle();
    await battleLoop();
}
// battle.js の battleLoop 関数の修正
async function battleLoop() {
    // battleLoopはホストのみが実行します。
    if (window.isOnlineMode() && !window.isHost()) {
        return;
    }

    while (true) {
        if (isBattleOver()) {
            if (window.isOnlineMode()) {
                window.sendData({ type: 'battle_end' });
            }
            handleBattleEnd();
            break;
        }

        const combatants = window.isOnlineMode() ?
            [...currentPlayerParty, ...opponentParty] :
            [...currentPlayerParty, ...currentEnemies];

        const aliveCombatants = combatants.filter(c => c.status.hp > 0);
        aliveCombatants.sort((a, b) => b.status.spd - a.status.spd);

        // 各キャラクターのターン
        for (const combatant of aliveCombatants) {
            if (isBattleOver()) break;
            if (combatant.status.hp <= 0) continue;

            const isPlayerCharacter = currentPlayerParty.includes(combatant);

            // ターン開始時の効果処理
            const actionSkipped = processStatusEffects(combatant);
            if (actionSkipped) continue;

            if (window.isOnlineMode()) {
                if (isPlayerCharacter) {
                    // ホストは自分のターンであればコマンドを表示
                    if (window.isHost()) {
                        logMessage('自分のターンです。コマンドを選択してください。');
                        await playerTurnOnline(combatant);
                    } else {
                        // クライアントのターンはホストから通知されるので、ここでは何もしない
                        // ただし、ホストは相手の行動を待機する
                    }
                } else {
                    // 相手（オンライン対戦の相手プレイヤー）のターン
                    if (window.isHost()) {
                        // クライアントにターン開始を通知し、クライアントからの行動を待機
                        window.sendData({
                            type: 'player_turn',
                            activePlayerId: combatant.id
                        });
                        logMessage('相手の行動を待機中...');
                        await new Promise(resolve => {
                            const handler = (data) => {
                                if (data.type === 'battle_action' && data.turn === currentTurn) {
                                    // 相手の行動を受信したら解決
                                    window.removeEventListener('data_received', handler);
                                    resolve();
                                }
                            };
                            window.addEventListener('data_received', handler);
                        });
                    }
                }
            } else {
                // シングルプレイ
                if (isPlayerCharacter) {
                    await playerTurn(combatant);
                } else {
                    await enemyTurn(combatant);
                }
            }
        }
        currentTurn++;

        // ターン終了時の効果処理
        for (const combatant of aliveCombatants) {
            processEndTurnEffects(combatant);
        }

        // ホストはゲーム状態をクライアントに送信
        if (window.isOnlineMode() && window.isHost()) {
            window.sendData({
                type: 'game_state',
                playerParty: currentPlayerParty,
                opponentParty: opponentParty,
                currentTurn: currentTurn
            });
        }
    }
}

// 状態異常効果の処理
function processStatusEffects(combatant) {
    // 深淵の狂気
    if (combatant.effects.abyssian_madness) {
        const madnessEffect = combatant.effects.abyssian_madness;
        const disableChance = 0.1 * madnessEffect.stacks;
        if (Math.random() < disableChance) {
            logMessage(`${combatant.name}は深淵の狂気に陥り、行動不能になった！`, 'status-effect');
            return true; // 行動をスキップ
        }
    }

    // 零唯のパッシブスキル「妖艶なる書架」
    if (combatant.id === 'char05' && currentPlayerParty && currentPlayerParty.includes(combatant)) {
        const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
        if (enemies) {
            enemies.forEach(enemy => {
                if (enemy.effects.abyssian_madness) {
                    if (Math.random() < 0.5) {
                        enemy.effects.abyssian_madness.stacks++;
                        logMessage(`零唯の「妖艶なる書架」が発動！${enemy.name}の狂気スタックが${enemy.effects.abyssian_madness.stacks}になった。`, 'special-event');
                    }
                }
            });
        }
    }

    return false;
}

// ターン終了時の効果処理
function processEndTurnEffects(combatant) {
    // 血晶の零滴
    if (combatant.effects.blood_crystal_drop) {
        const dropEffect = combatant.effects.blood_crystal_drop;
        if (dropEffect.duration > 0) {
            const baseDamage = Math.floor(dropEffect.casterMatk * 0.3);
            const damage = Math.max(1, baseDamage - Math.floor(combatant.status.mdef / 2));
            combatant.status.hp = Math.max(0, combatant.status.hp - damage);
            logMessage(`${combatant.name}は「血晶の零滴」で${damage}のダメージを受けた！`, 'damage');

            if (currentPlayerParty) {
                const caster = currentPlayerParty.find(p => p.id === dropEffect.casterId);
                if (caster) {
                    const mpRecovery = Math.floor(damage * 0.5);
                    caster.status.mp = Math.min(caster.status.maxMp, caster.status.mp + mpRecovery);
                    updatePlayerDisplay();
                    logMessage(`${caster.name}はMPを${mpRecovery}回復した。`, 'heal');
                }
            }
            dropEffect.duration--;
        } else {
            delete combatant.effects.blood_crystal_drop;
            logMessage(`${combatant.name}の「血晶の零滴」効果が切れた。`, 'status-effect');
        }
    }

    // 他の状態異常の時間減少処理
    ['fadingBody', 'curse', 'extinguishSpirit', 'void'].forEach(effectName => {
        if (combatant.effects[effectName]) {
            combatant.effects[effectName].duration--;
            if (combatant.effects[effectName].duration <= 0) {
                delete combatant.effects[effectName];
                logMessage(`${combatant.name}の効果が切れた。`, 'status-effect');
            }
        }
    });
}

// 味方ターンの処理（シングルプレイ用）
function playerTurn(player) {
    return new Promise(resolve => {
        logMessage(`${player.name}のターン！`);
        selectCommand(activePlayerIndex);

        commandAreaEl.onclick = async (event) => {
            const target = event.target;
            let actionTaken = false;

            if (target.classList.contains('action-attack')) {
                logMessage('対象を選んでください。');
                const enemySelection = await selectEnemyTarget();
                if (enemySelection) {
                    const damage = performAttack(player, enemySelection);
                    if (player.effects.curse && damage > 0) {
                        const curseDamage = Math.floor(player.status.maxHp * 0.05);
                        player.status.hp = Math.max(0, player.status.hp - curseDamage);
                        logMessage(`${player.name}は「呪縛」で${curseDamage}のダメージを受けた！`, 'damage');
                    }
                    actionTaken = true;
                }
            } else if (target.classList.contains('action-skill')) {
                const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
                skillMenuEl.classList.toggle('hidden');
            } else if (target.classList.contains('skill-button')) {
                const skillName = target.textContent;
                const skill = player.active.find(s => s.name === skillName);
                if (skill) {
                    let mpCost = skill.mp;
                    if (player.effects.curse) {
                        mpCost = Math.floor(mpCost * 1.5);
                        logMessage(`${player.name}の「呪縛」により、MP消費が${mpCost}に増加した。`);
                    }

                    if (player.status.mp < mpCost) {
                        logMessage(`MPが足りません！`);
                        return;
                    }

                    logMessage(`${player.name}は${skill.name}を使った！`);
                    player.status.mp -= mpCost;

                    // スキル効果の実行
                    actionTaken = await executeSkill(player, skill);
                }
            }

            if (actionTaken) {
                commandAreaEl.classList.add('hidden');
                updatePlayerDisplay();
                resolve();
            }
        };
    });
}

// スキル実行
async function executeSkill(player, skill) {
    switch (skill.name) {
        case 'ヒールライト':
            logMessage('回復する味方を選択してください。');
            const targetPlayer = await selectPlayerTarget();
            if (targetPlayer) {
                performHeal(player, targetPlayer);
                return true;
            }
            break;
        case '連撃':
            logMessage('攻撃する敵を選択してください。');
            const targetEnemy = await selectEnemyTarget();
            if (targetEnemy) {
                performMultiAttack(player, targetEnemy);
                return true;
            }
            break;
        case 'なぎ払い':
        case 'ブリザード':
            const targets = window.isOnlineMode() ? opponentParty : currentEnemies;
            performAreaAttack(player, targets);
            return true;
        case '蠱惑の聖歌':
            performSanctuaryHymn(player);
            return true;
        case '深淵の理路':
            performAbyssalLogic(player);
            return true;
        case '血晶の零滴':
            logMessage('攻撃する敵を選択してください。');
            const dropTarget = await selectEnemyTarget();
            if (dropTarget) {
                performBloodCrystalDrop(player, dropTarget);
                return true;
            }
            break;
        default:
            logMessage('このスキルはまだ実装されていません。');
            player.status.mp += skill.mp;
            break;
    }
    return false;
}

// 敵ターンの処理
async function enemyTurn(enemy) {
    logMessage(`${enemy.name}のターン！`);

    // 簡単なAI：ランダムに味方を攻撃
    if (currentPlayerParty) {
        const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
        if (alivePlayers.length > 0) {
            const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
            const damage = calculateDamage(enemy, target);
            target.status.hp = Math.max(0, target.status.hp - damage);
            updatePlayerDisplay();
        }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
}

// 攻撃処理
function performAttack(attacker, target) {
    const damage = calculateDamage(attacker, target, attacker.attackType === 'magic');
    target.status.hp = Math.max(0, target.status.hp - damage);
    updateEnemyDisplay();
    return damage;
}

// 複数回攻撃
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

    if (attacker.effects.curse && totalDamage > 0) {
        const curseDamage = Math.floor(attacker.status.maxHp * 0.05);
        attacker.status.hp = Math.max(0, attacker.status.hp - curseDamage);
        logMessage(`${attacker.name}は「呪縛」で${curseDamage}のダメージを受けた！`, 'damage');
    }
}

// 全体攻撃
function performAreaAttack(attacker, targets) {
    if (targets) {
        targets.forEach(target => {
            if (target.status.hp > 0) {
                const damage = calculateDamage(attacker, target, attacker.attackType === 'magic');
                target.status.hp = Math.max(0, target.status.hp - damage);
            }
        });
        updateEnemyDisplay();
    }
}

// 回復処理
function performHeal(healer, target) {
    const healAmount = healer.status.support * 2;
    logMessage(`${healer.name}は${target.name}を${healAmount}回復した。`, 'heal');
    target.status.hp = Math.min(target.status.maxHp, target.status.hp + healAmount);
    updatePlayerDisplay();
}

// 「蠱惑の聖歌」の実装
function performSanctuaryHymn(caster) {
    const healAmount = Math.floor(caster.status.support * 0.5);
    if (currentPlayerParty) {
        currentPlayerParty.forEach(p => {
            p.status.hp = Math.min(p.status.maxHp, p.status.hp + healAmount);
            p.effects.abyssal_worship = { duration: 5, casterSupport: caster.status.support / 60 };
            logMessage(`${p.name}は「深淵の崇拝」の効果を得た！`, 'status-effect');
        });
        updatePlayerDisplay();
    }
}

// 「深淵の理路」の実装
function performAbyssalLogic(caster) {
    const targets = window.isOnlineMode() ? opponentParty : currentEnemies;
    if (targets) {
        targets.forEach(enemy => {
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
}

// 「血晶の零滴」の実装
function performBloodCrystalDrop(caster, target) {
    target.effects.blood_crystal_drop = { duration: 3, casterMatk: caster.status.matk, casterId: caster.id };
    logMessage(`${target.name}は「血晶の零滴」状態になった。`, 'status-effect');
}

// 戦闘終了判定
function isBattleOver() {
    // currentPlayerPartyが未定義の場合の安全性チェック
    if (!currentPlayerParty || !Array.isArray(currentPlayerParty)) {
        return false;
    }

    const playersAlive = currentPlayerParty.some(p => p.status.hp > 0);

    if (window.isOnlineMode()) {
        // オンライン対戦時：opponentPartyが未定義の場合は戦闘継続
        const opponentsAlive = (opponentParty && Array.isArray(opponentParty)) ?
            opponentParty.some(p => p.status.hp > 0) : true;
        return !playersAlive || !opponentsAlive;
    } else {
        // シングルプレイ時：currentEnemiesが未定義の場合は戦闘継続
        const enemiesAlive = (currentEnemies && Array.isArray(currentEnemies)) ?
            currentEnemies.some(e => e.status.hp > 0) : true;
        return !playersAlive || !enemiesAlive;
    }
}

// 戦闘終了処理
function handleBattleEnd() {
    if (!currentPlayerParty || !Array.isArray(currentPlayerParty)) {
        return;
    }

    const playersAlive = currentPlayerParty.some(p => p.status.hp > 0);

    if (window.isOnlineMode()) {
        if (playersAlive) {
            logMessage('勝利しました！');
        } else {
            logMessage('敗北しました...');
        }
        handleGameOver();
    } else {
        if (playersAlive) {
            logMessage('敵グループを撃破しました！');
            currentGroupIndex++;

            currentPlayerParty.forEach(p => {
                p.status.hp = p.status.maxHp;
                p.status.mp = p.status.maxMp;
            });
            updatePlayerDisplay();

            if (currentGroupIndex < enemyGroups.length) {
                logMessage('次の敵グループに挑みます...');
                setTimeout(() => {
                    startNextGroup();
                }, 2000);
            } else {
                handleGameWin();
            }
        } else {
            logMessage('全滅しました... ゲームオーバー');
            handleGameOver();
        }
    }
}

// ゲーム勝利処理
function handleGameWin() {
    logMessage('すべての敵を倒しました！');
    logMessage('ゲームクリア！おめでとうございます！');
    commandAreaEl.innerHTML = '';
    goButton.disabled = false;
    battleScreenEl.classList.add('hidden');
    partyScreen.classList.remove('hidden');
}

// ゲームオーバー処理
function handleGameOver() {
    commandAreaEl.innerHTML = '';
    goButton.disabled = false;
    battleScreenEl.classList.add('hidden');
    partyScreen.classList.remove('hidden');
}

// 敵選択（シングルプレイ用）
function selectEnemyTarget() {
    return new Promise(resolve => {
        if (!currentEnemies || !Array.isArray(currentEnemies)) {
            resolve(null);
            return;
        }

        const enemies = currentEnemies.filter(e => e.status.hp > 0);
        if (enemies.length === 0) {
            resolve(null);
            return;
        }

        renderEnemySelection(enemies);

        enemyPartyEl.onclick = (event) => {
            const targetEl = event.target.closest(".enemy-character");
            if (targetEl) {
                const targetId = targetEl.dataset.enemyId;
                const target = currentEnemies.find(e => e.id === targetId);
                if (target && target.status.hp > 0) {
                    enemyPartyEl.querySelectorAll(".enemy-character").forEach(el => el.classList.remove("selected-target"));
                    resolve(target);
                }
            }
        };
    });
}

// 味方選択（シングルプレイ用）
function selectPlayerTarget() {
    return new Promise(resolve => {
        if (!currentPlayerParty || !Array.isArray(currentPlayerParty)) {
            resolve(null);
            return;
        }

        const players = currentPlayerParty.filter(p => p.status.hp > 0);
        if (players.length === 0) {
            resolve(null);
            return;
        }

        renderPlayerSelection(players);

        playerPartyEl.onclick = (event) => {
            const targetEl = event.target.closest(".player-character");
            if (targetEl) {
                const targetId = targetEl.dataset.charId;
                const target = currentPlayerParty.find(e => e.id === targetId);
                if (target && target.status.hp > 0) {
                    playerPartyEl.querySelectorAll(".player-character").forEach(el => el.classList.remove("selected-target"));
                    resolve(target);
                }
            }
        };
    });
}

// コマンドメニューの作成
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

// 戦闘画面を描画
function renderBattle() {
    // 敵パーティーの描画
    const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
    if (enemies) {
        renderEnemySelection(enemies);
    }

    // 味方パーティーの描画
    if (currentPlayerParty) {
        renderPlayerSelection(currentPlayerParty);
    }

    // コマンドエリアを初期化
    commandAreaEl.innerHTML = createCommandMenu();
    commandAreaEl.classList.add('hidden');
}

// ログメッセージ
function logMessage(message, type = '') {
    const p = document.createElement('p');
    p.textContent = message;
    if (type) {
        p.classList.add(`log-message`, type);
    }
    messageLogEl.appendChild(p);
    messageLogEl.scrollTop = messageLogEl.scrollHeight;
}

// コマンド選択
function selectCommand(playerIndex) {
    if (!currentPlayerParty || !Array.isArray(currentPlayerParty)) {
        return;
    }

    const players = document.querySelectorAll('.player-character');
    const partyMembers = currentPlayerParty;

    players.forEach(p => p.classList.remove('active'));
    if (players[playerIndex]) {
        players[playerIndex].classList.add('active');
    }
    commandAreaEl.classList.remove('hidden');

    updateCommandMenu(partyMembers[playerIndex]);
}

// コマンドメニューの更新
function updateCommandMenu(player) {
    if (!player) return;

    const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
    const specialButtonEl = commandAreaEl.querySelector('.action-special');

    if (skillMenuEl) {
        skillMenuEl.innerHTML = player.active.map(skill => {
            return `<button class="skill-button">${skill.name}</button>`;
        }).join('');
    }

    if (player.id === 'char06') {
        const enemies = window.isOnlineMode() ? opponentParty : currentEnemies;
        player.special.condition = (p) => {
            return enemies && enemies.some(e => Object.keys(e.effects || {}).length >= 2);
        };
    }

    if (specialButtonEl && player.special.condition && player.special.condition(player)) {
        specialButtonEl.classList.remove('hidden');
    } else if (specialButtonEl) {
        specialButtonEl.classList.add('hidden');
    }
}

// battle.js の handleBattleAction 関数の修正
window.handleBattleAction = function (data) {
    console.log('Handling battle action:', data);

    const isHost = window.isHost();
    let actor, target;

    // 行動者を特定
    if (isHost) {
        actor = opponentParty.find(p => p.id === data.actorId);
    } else {
        actor = currentPlayerParty.find(p => p.id === data.actorId);
    }

    // ターゲットを特定
    if (data.targetIndex !== undefined) {
        if (isHost) {
            target = currentPlayerParty[data.targetIndex];
        } else {
            target = opponentParty[data.targetIndex];
        }
    }

    if (!actor) {
        console.error('Invalid actor received.');
        return;
    }

    // 行動のタイプに応じて処理を分岐
    switch (data.action) {
        case 'attack':
            if (target) {
                const damage = calculateDamage(actor, target, actor.attackType === 'magic');
                target.status.hp = Math.max(0, target.status.hp - damage);
                updatePlayerDisplay();
                updateEnemyDisplay();
            }
            break;
        case 'defend':
            logMessage(`${actor.name}は防御した。`);
            actor.isDefending = true;
            break;
        case 'skill':
            // スキル処理
            if (data.skill) {
                executeSkillOnline(actor, data.skill, data.targetIds);
            }
            break;
    }

    // クライアント側でターンが終了した後に次のターンに進む
    if (!isHost) {
        startOnlineBattle();
    }
};

// ゲーム状態同期
function syncGameState(data) {
    console.log('Game state sync:', data);
    // 必要に応じてゲーム状態を同期
}

// グローバルスコープに公開
window.startBattle = startBattle;
window.renderBattle = renderBattle;
window.handleBattleAction = handleBattleAction;
window.syncGameState = syncGameState;

// オンライン対戦用のパーティー情報受信処理をグローバルに公開
window.handleOpponentParty = handleOpponentParty;

// 敵選択のUIをレンダリング
function renderEnemySelection(enemies) {
    enemyPartyEl.innerHTML = ""; // 既存の敵表示をクリア
    if (!enemies || !Array.isArray(enemies)) return;

    enemies.forEach(enemy => {
        const enemyEl = document.createElement("div");
        enemyEl.classList.add("character-card", "enemy-character");
        enemyEl.dataset.enemyId = enemy.id;
        enemyEl.innerHTML = `
            <h3>${enemy.name}</h3>
            <p>HP: <span class="hp-text">${enemy.status.hp}/${enemy.status.maxHp}</span></p>
            <div class="hp-bar"><div class="hp-bar-fill" style="width: ${(enemy.status.hp / enemy.status.maxHp) * 100}%;"></div></div>
        `;
        enemyPartyEl.appendChild(enemyEl);
    });
    // 選択可能な敵にクリックイベントを追加
    enemyPartyEl.querySelectorAll(".enemy-character").forEach(el => {
        el.addEventListener("click", () => {
            enemyPartyEl.querySelectorAll(".enemy-character").forEach(e => e.classList.remove("selected-target"));
            el.classList.add("selected-target");
        });
    });
}

// 味方選択のUIをレンダリング
function renderPlayerSelection(players) {
    playerPartyEl.innerHTML = ""; // 既存の味方表示をクリア
    if (!players || !Array.isArray(players)) return;

    players.forEach(player => {
        const playerEl = document.createElement("div");
        playerEl.classList.add("character-card", "player-character");
        playerEl.dataset.charId = player.id;
        playerEl.innerHTML = `
            <h3>${player.name}</h3>
            <p>HP: <span class="hp-text">${player.status.hp}/${player.status.maxHp}</span></p>
            <div class="hp-bar"><div class="hp-bar-fill" style="width: ${(player.status.hp / player.status.maxHp) * 100}%;"></div></div>
            <p>MP: <span class="mp-text">${player.status.mp}/${player.status.maxMp}</span></p>
            <div class="mp-bar"><div class="mp-bar-fill" style="width: ${(player.status.mp / player.status.maxMp) * 100}%;"></div></div>
        `;
        playerPartyEl.appendChild(playerEl);
    });
    // 選択可能な味方にクリックイベントを追加
    playerPartyEl.querySelectorAll(".player-character").forEach(el => {
        el.addEventListener("click", () => {
            playerPartyEl.querySelectorAll(".player-character").forEach(e => e.classList.remove("selected-target"));
            el.classList.add("selected-target");
        });
    });
}

// オンライン対戦用のアクション処理
window.handleBattleAction = function (data) {
    console.log('Handling battle action:', data);

    switch (data.action) {
        case 'attack':
            // 相手の攻撃を処理
            if (opponentParty && currentPlayerParty) {
                const attacker = opponentParty.find(p => p.id === data.actorId);
                const target = currentPlayerParty[data.targetIndex];
                if (attacker && target) {
                    performAttackOnline(attacker, target);
                }
            }
            break;
        // 他のアクションも同様に実装...
    }

    // 次のターンに進む
    currentTurn++;
    if (!isBattleOver()) {
        startOnlineBattle();
    } else {
        handleBattleEnd();
    }
};

async function startOnlineBattle() {
    if (window.isHost()) {
        // ホストの場合は battleLoop で制御されるため何もしない
        return;
    }

    // クライアント側でターンが終了したら、次のホストからの指示を待機
    if (!isBattleOver()) {
        logMessage('相手の行動を待機中...');
        waitingForOpponent = true;
    }
}

// 回避判定結果の処理
window.handleDodgeResult = function (data) {
    if (!window.isHost()) {
        const attacker = opponentParty.find(p => p.id === data.attackerId);
        const defender = currentPlayerParty.find(p => p.id === data.defenderId);
        if (data.dodged) {
            logMessage(`${defender.name}は攻撃を回避した！`, 'status-effect');
        }
        if (attacker.name === 'きり（ゲーム）' && data.dodged) {
            attacker.targetMemory = { lastTargetId: defender.id, missed: true };
        }
    }
};

// 会心判定結果の処理
window.handleCriticalResult = function (data) {
    if (!window.isHost()) {
        if (data.critical) {
            logMessage(`会心の一撃！`, 'special-event');
        }
    }
};

// ゲーム状態の同期
window.syncGameState = function (data) {
    console.log('Syncing game state:', data);

    if (data.playerParty) {
        currentPlayerParty = data.playerParty;
        updatePlayerDisplay();
    }

    if (data.opponentParty) {
        opponentParty = data.opponentParty;
        updateEnemyDisplay();
    }

    if (data.currentTurn !== undefined) {
        currentTurn = data.currentTurn;
    }
};

// グローバルスコープに公開する関数に handleBattleResult を追加
window.handleBattleResult = function (data) {
    const isHost = window.isHost();

    // どのパーティーから探すかを決定
    const playerPartyToSearch = isHost ? window.currentPlayerParty : window.opponentParty;
    const enemyPartyToSearch = isHost ? window.opponentParty : window.currentPlayerParty;

    // IDに基づいてアタッカーとディフェンダーのオブジェクトを取得
    let attacker = playerPartyToSearch.find(p => p.id === data.attackerId) || enemyPartyToSearch.find(p => p.id === data.attackerId);
    let defender = playerPartyToSearch.find(p => p.id === data.defenderId) || enemyPartyToSearch.find(p => p.id === data.defenderId);

    if (!attacker || !defender) {
        console.error('Attacker or defender not found!', data);
        return;
    }

    // ログ表示のロジックを統合
    if (data.specialEffectLog) {
        logMessage(data.specialEffectLog, 'status-effect');
    }

    if (data.dodged) {
        logMessage(`${defender.name}は攻撃を回避した！`, 'status-effect');
    } else {
        if (data.critical) {
            logMessage(`会心の一撃！`, 'special-event');
        }
        logMessage(`${attacker.name}の攻撃！${defender.name}に${data.damage}のダメージ！`, 'damage');
    }

    // HP更新
    defender.status.hp = Math.max(0, defender.status.hp - data.damage);
    updatePlayerDisplay();
    updateEnemyDisplay();
};