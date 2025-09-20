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
    return damage.toFixed(2);
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

// 戦闘ロジックの開始
async function startBattle() {
    logMessage('戦闘開始！');
    currentPlayerParty = window.getSelectedParty();
    currentGroupIndex = 0;

    // プレイヤーと敵に状態管理用オブジェクトを追加
    currentPlayerParty.forEach(p => {
        p.effects = {};
        if (p.id === 'char06') { // きり（スタイル）に執着のメモリを追加
            p.targetMemory = { lastTargetId: null, missed: false };
        }
    });

    // 最初の敵グループを設定
    await startNextGroup();
}

// 次の敵グループとの戦闘を開始する
async function startNextGroup() {
    if (currentGroupIndex >= enemyGroups.length) {
        // すべてのグループをクリア
        handleGameWin();
        return;
    }

    const group = enemyGroups[currentGroupIndex];
    logMessage(`${group.name}との戦闘！`);

    // グループの敵データを読み込み
    currentEnemies = group.enemies.map(enemyId => {
        const enemy = enemyData.find(e => e.id === enemyId);
        // ステータスをコピーして新たな敵を作成
        return { ...enemy, status: { ...enemy.status }, effects: {} }; // effectsを追加
    });

    renderBattle(); // 敵パーティーを再描画
    await battleLoop();
}

// 戦闘ループ（速度順）
async function battleLoop() {
    while (true) {
        const allCombatants = [...currentPlayerParty, ...currentEnemies];
        const aliveCombatants = allCombatants.filter(c => c.status.hp > 0);

        // 速度順にソート
        aliveCombatants.sort((a, b) => b.status.spd - a.status.spd);

        for (const combatant of aliveCombatants) {
            if (isBattleOver()) break;
            if (combatant.status.hp <= 0) continue;

            // ターン開始時の効果を処理
            if (combatant.effects.abyssian_madness) { // 深淵の狂気
                const madnessEffect = combatant.effects.abyssian_madness;
                const disableChance = 0.1 * madnessEffect.stacks;
                if (Math.random() < disableChance) {
                    logMessage(`${combatant.name}は深淵の狂気に陥り、行動不能になった！`, 'status-effect');
                    continue; // 行動をスキップ
                }
            }

            // 「衰躯」の効果を適用
            let originalStatus = { ...combatant.status };
            if (combatant.effects.fadingBody) {
                const debuffAmount = 0.25;
                combatant.status.def = Math.max(1, combatant.status.def * (1 - debuffAmount));
                combatant.status.mdef = Math.max(1, combatant.status.mdef * (1 - debuffAmount));
                combatant.status.support = Math.max(1, combatant.status.support * (1 - debuffAmount));
                logMessage(`${combatant.name}は「衰躯」でステータスが低下した！`, 'status-effect');
            }

            // 「虚空」の効果を適用
            if (combatant.effects.void) {
                const debuffAmount = 0.25;
                combatant.status.atk = Math.max(1, combatant.status.atk * (1 - debuffAmount));
                combatant.status.matk = Math.max(1, combatant.status.matk * (1 - debuffAmount));
                combatant.status.def = Math.max(1, combatant.status.def * (1 - debuffAmount));
                combatant.status.mdef = Math.max(1, combatant.status.mdef * (1 - debuffAmount));
                combatant.status.spd = Math.max(1, combatant.status.spd * (1 - debuffAmount));
                combatant.status.support = Math.max(1, combatant.status.support * (1 - debuffAmount));
                logMessage(`${combatant.name}は「虚空」で全てのステータスが低下した！`, 'status-effect');
            }

            // 零唯のパッシブスキル「妖艶なる書架」を処理
            if (combatant.id === 'char05' && currentPlayerParty.includes(combatant)) {
                currentEnemies.forEach(enemy => {
                    if (enemy.effects.abyssian_madness) {
                        if (Math.random() < 0.5) { // 50%の確率で発動
                            enemy.effects.abyssian_madness.stacks++;
                            logMessage(`零唯の「妖艶なる書架」が発動！${enemy.name}の狂気スタックが${enemy.effects.abyssian_madness.stacks}になった。`, 'special-event');
                        }
                    }
                });
            }

            if (currentPlayerParty.includes(combatant)) {
                // 味方ターン
                activePlayerIndex = currentPlayerParty.indexOf(combatant);
                await playerTurn(combatant);
            } else {
                // 敵ターン
                await enemyTurn(combatant);
            }

            // ターン終了時の効果を処理
            if (combatant.effects.blood_crystal_drop) { // 血晶の零滴
                const dropEffect = combatant.effects.blood_crystal_drop;
                if (dropEffect.duration > 0) {
                    const baseDamage = Math.floor(dropEffect.casterMatk * 0.3);
                    const damage = Math.max(1, baseDamage - Math.floor(combatant.status.mdef / 2));
                    combatant.status.hp = Math.max(0, combatant.status.hp - damage);
                    logMessage(`${combatant.name}は「血晶の零滴」で${damage}のダメージを受けた！`, 'damage');
                    const caster = currentPlayerParty.find(p => p.id === dropEffect.casterId);
                    if (caster) {
                        const mpRecovery = Math.floor(damage * 5);
                        caster.status.mp = Math.min(caster.status.maxMp, caster.status.mp + mpRecovery);
                        updatePlayerDisplay();
                        logMessage(`${caster.name}はMPを${mpRecovery}回復した。`, 'heal');
                    }
                    dropEffect.duration--;
                } else {
                    delete combatant.effects.blood_crystal_drop;
                    logMessage(`${combatant.name}の「血晶の零滴」効果が切れた。`, 'status-effect');
                }
            }

            // 「衰躯」の効果時間減少
            if (combatant.effects.fadingBody) {
                combatant.effects.fadingBody.duration--;
                if (combatant.effects.fadingBody.duration <= 0) {
                    delete combatant.effects.fadingBody;
                    logMessage(`${combatant.name}の「衰躯」効果が切れた。`, 'status-effect');
                }
            }

            // 「呪縛」の効果時間減少
            if (combatant.effects.curse) {
                combatant.effects.curse.duration--;
                if (combatant.effects.curse.duration <= 0) {
                    delete combatant.effects.curse;
                    logMessage(`${combatant.name}の「呪縛」効果が切れた。`, 'status-effect');
                }
            }

            // 「滅気」の効果時間減少
            if (combatant.effects.extinguishSpirit) {
                combatant.effects.extinguishSpirit.duration--;
                if (combatant.effects.extinguishSpirit.duration <= 0) {
                    delete combatant.effects.extinguishSpirit;
                    logMessage(`${combatant.name}の「滅気」効果が切れた。`, 'status-effect');
                }
            }

            // 「虚空」の効果時間減少
            if (combatant.effects.void) {
                combatant.effects.void.duration--;
                if (combatant.effects.void.duration <= 0) {
                    delete combatant.effects.void;
                    logMessage(`${combatant.name}の「虚空」効果が切れた。`, 'status-effect');
                }
            }

            // 元のステータスに戻す
            combatant.status = originalStatus;
        }

        if (isBattleOver()) break;
    }

    // 戦闘終了
    handleBattleEnd();
}

// 味方ターンの処理
function playerTurn(player) {
    return new Promise(resolve => {
        logMessage(`${player.name}のターン！`);
        selectCommand(activePlayerIndex);

        commandAreaEl.onclick = async (event) => {
            const target = event.target;
            let actionTaken = false;

            if (target.classList.contains('action-attack')) {
                // 攻撃対象を選択
                logMessage('対象を選んでください。');
                const enemySelection = await selectEnemyTarget();
                if (enemySelection) {
                    const damage = performAttack(player, enemySelection);
                    // 呪縛の効果判定
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
                    // 「呪縛」によるMPコスト増加
                    let mpCost = skill.mp;
                    if (player.effects.curse) {
                        mpCost = Math.floor(mpCost * 1.5);
                        logMessage(`${player.name}の「呪縛」により、MP消費が${mpCost}に増加した。`);
                    }

                    if (player.status.mp < mpCost) {
                        logMessage(`MPが足りません！`);
                        return; // スキル発動を中止
                    }

                    logMessage(`${player.name}は${skill.name}を使った！`);
                    player.status.mp -= mpCost; // MP消費

                    // スキルの効果をここで実行
                    if (skill.name === 'ヒールライト') {
                        logMessage('回復する味方を選択してください。');
                        const targetPlayer = await selectPlayerTarget();
                        if (targetPlayer) {
                            performHeal(player, targetPlayer);
                            actionTaken = true;
                        }
                    } else if (skill.name === '連撃') {
                        logMessage('攻撃する敵を選択してください。');
                        const targetEnemy = await selectEnemyTarget();
                        if (targetEnemy) {
                            performMultiAttack(player, targetEnemy);
                            actionTaken = true;
                        }
                    } else if (skill.name === 'なぎ払い' || skill.name === 'ブリザード') {
                        performAreaAttack(player, currentEnemies);
                        actionTaken = true;
                    } else if (skill.name === '蠱惑の聖歌') {
                        performSanctuaryHymn(player);
                        actionTaken = true;
                    } else if (skill.name === '深淵の理路') {
                        performAbyssalLogic(player);
                        actionTaken = true;
                    } else if (skill.name === '血晶の零滴') {
                        logMessage('攻撃する敵を選択してください。');
                        const targetEnemy = await selectEnemyTarget();
                        if (targetEnemy) {
                            performBloodCrystalDrop(player, targetEnemy);
                            actionTaken = true;
                        }
                    } else if (skill.name === '滅気') {
                        logMessage('デバフを付与する敵を選択してください。');
                        const targetEnemy = await selectEnemyTarget();
                        if (targetEnemy) {
                            performExtinguishSpirit(player, targetEnemy);
                            actionTaken = true;
                        }
                    } else if (skill.name === '衰躯') {
                        performFadingBody(player, currentEnemies);
                        actionTaken = true;
                    } else if (skill.name === '呪縛') {
                        logMessage('デバフを付与する敵を選択してください。');
                        const targetEnemy = await selectEnemyTarget();
                        if (targetEnemy) {
                            performCurse(player, targetEnemy);
                            actionTaken = true;
                        }
                    } else {
                        logMessage('このスキルはまだ実装されていません。');
                        player.status.mp += mpCost; // 未実装スキルのためMPを戻す
                    }

                    if (actionTaken) {
                        // 呪縛の効果判定（スキルによるダメージ）
                        if (player.effects.curse && skill.type === 'attack') { // スキルタイプに応じて修正が必要
                            const curseDamage = Math.floor(player.status.maxHp * 0.05);
                            player.status.hp = Math.max(0, player.status.hp - curseDamage);
                            logMessage(`${player.name}は「呪縛」で${curseDamage}のダメージを受けた！`, 'damage');
                        }
                    }
                }
            } else if (target.classList.contains('action-special')) {
                const specialSkill = player.special;
                if (specialSkill && specialSkill.condition && specialSkill.condition(player)) {
                    if (player.status.mp < specialSkill.mp) {
                        logMessage(`MPが足りません！`);
                        return;
                    }

                    logMessage(`${player.name}は「${specialSkill.name}」を使った！`);
                    player.status.mp -= specialSkill.mp; // MP消費

                    if (specialSkill.name === '狂気の再編') {
                        performMadnessReorganization(player);
                        actionTaken = true;
                    } else if (specialSkill.name === '虚空') {
                        performVoid(player, currentEnemies);
                        actionTaken = true;
                    }
                } else {
                    logMessage('必殺技の条件を満たしていません。');
                }
            } else if (target.classList.contains('action-defend')) {
                logMessage(`${player.name}は防御した。`);
                actionTaken = true;
            }

            if (actionTaken) {
                // ターン終了
                updatePlayerDisplay(); // MP消費を反映
                commandAreaEl.classList.add('hidden');
                commandAreaEl.onclick = null;
                resolve();
            }
        };
    });
}

// 敵ターンの処理
function enemyTurn(enemy) {
    return new Promise(resolve => {
        setTimeout(() => {
            logMessage(`${enemy.name}のターン！`);
            const alivePlayers = currentPlayerParty.filter(p => p.status.hp > 0);
            if (alivePlayers.length > 0) {
                const targetPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                // 敵の行動（ここではシンプルに物理攻撃）
                const damage = calculateDamage(enemy, targetPlayer);
                targetPlayer.status.hp = Math.max(0, targetPlayer.status.hp - damage);
                // 呪縛の効果判定
                if (enemy.effects.curse && damage > 0) {
                    const curseDamage = Math.floor(enemy.status.maxHp * 0.05);
                    enemy.status.hp = Math.max(0, enemy.status.hp - curseDamage);
                    logMessage(`${enemy.name}は「呪縛」で${curseDamage}のダメージを受けた！`, 'damage');
                    updateEnemyDisplay();
                }
                updatePlayerDisplay();
            }
            resolve();
        }, 1000); // 1秒待機
    });
}

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
    return damage; // ダメージ量を返すように変更
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
    // 呪縛の効果判定
    if (attacker.effects.curse && totalDamage > 0) {
        const curseDamage = Math.floor(attacker.status.maxHp * 0.05);
        attacker.status.hp = Math.max(0, attacker.status.hp - curseDamage);
        logMessage(`${attacker.name}は「呪縛」で${curseDamage}のダメージを受けた！`, 'damage');
    }
}

// 全体攻撃アクション
function performAreaAttack(attacker, targets) {
    targets.forEach(target => {
        if (target.status.hp > 0) {
            const damage = calculateDamage(attacker, target, attacker.attackType === 'magic');
            target.status.hp = Math.max(0, target.status.hp - damage);
            // 呪縛の効果判定
            if (attacker.effects.curse && damage > 0) {
                const curseDamage = Math.floor(attacker.status.maxHp * 0.05);
                attacker.status.hp = Math.max(0, attacker.status.hp - curseDamage);
                logMessage(`${attacker.name}は「呪縛」で${curseDamage}のダメージを受けた！`, 'damage');
            }
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
    // 補助力に応じた回復量
    const healAmount = Math.floor(caster.status.support * 0.5);
    currentPlayerParty.forEach(p => {
        p.status.hp = Math.min(p.status.maxHp, p.status.hp + healAmount);
        // 補助力に応じたダメージ上昇効果を保存
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
            enemy.effects.abyssian_madness.duration = 5; // ターンをリフレッシュ
            logMessage(`${enemy.name}の「深淵の狂気」スタックが${enemy.effects.abyssian_madness.stacks}になった。`, 'status-effect');
        }
    });
}

// 「血晶の零滴」の実装
function performBloodCrystalDrop(caster, target) {
    // 魔法攻撃力とキャスターIDを保存
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
        // スタック数と自身の魔法攻撃力に応じた大ダメージ
        const baseDamage = Math.floor(caster.status.matk * stacks);
        const damage = Math.max(1, baseDamage - Math.floor(target.status.mdef / 2));

        target.status.hp = Math.max(0, target.status.hp - damage);
        logMessage(`${target.name}に「狂気の再編」で${damage}のダメージ！`, 'damage');

        // スタックをリセット
        delete target.effects.abyssian_madness;

        // 「深淵の残響」を付与
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
        if (target.effects.void) debuffCount--; // 虚空自身はカウントしない

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

// 敵グループ戦闘終了後の処理
function handleBattleEnd() {
    const playersAlive = currentPlayerParty.some(p => p.status.hp > 0);
    if (playersAlive) {
        logMessage('敵グループを撃破しました！');
        currentGroupIndex++;
        // プレイヤーのHPとMPを回復
        currentPlayerParty.forEach(p => {
            p.status.hp = p.status.maxHp;
            p.status.mp = p.status.maxMp;
        });
        updatePlayerDisplay();

        // 次の戦闘に進むか、全クリか
        if (currentGroupIndex < enemyGroups.length) {
            logMessage('次の敵グループに挑みます...');
            setTimeout(() => {
                startNextGroup();
            }, 2000); // 2秒後に次の戦闘開始
        } else {
            handleGameWin();
        }
    } else {
        logMessage('全滅しました... ゲームオーバー');
        handleGameOver();
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
    // 敵パーティーの描画
    enemyPartyEl.innerHTML = '';
    currentEnemies.forEach(enemy => { // 変更：currentEnemiesを使用
        const enemyDiv = document.createElement('div');
        enemyDiv.className = 'enemy-character';
        enemyDiv.innerHTML = `
            <img src="${enemy.image}" alt="${enemy.name}">
            <p>${enemy.name}</p>
            <div class="hp-bar"><div class="hp-bar-fill" style="width: 100%;"></div></div>
            <p class="hp-text">${enemy.status.hp}/${enemy.status.maxHp}</p>
        `;
        enemyPartyEl.appendChild(enemyDiv);
    });

    // 味方パーティーの描画（パーティー編成画面で選んだキャラクターを反映）
    playerPartyEl.innerHTML = '';
    currentPlayerParty.forEach(player => { // 変更：currentPlayerPartyを使用
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

    // コマンドエリアを初期化
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

    // きり（スタイル）の必殺技条件
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

// グローバルスコープに公開
window.startBattle = startBattle;
window.renderBattle = renderBattle;