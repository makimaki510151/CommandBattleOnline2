// character_abilities.js

/**
 * パッシブ能力のロジック
 * キーはキャラクターID (char01, char02, etc.)
 * 各関数はキャラクターオブジェクトを引数に取り、ターン開始時に適用される効果を処理します。
 */
export const passiveAbilities = {
    'char01': (character, allies, enemies) => {
        // 不屈の守護: 自身以外の味方全体が受ける物理ダメージを10%軽減する。
        // この効果はダメージ計算時に適用されるため、ここでは何もしません。
        // ダメージ計算ロジック側で、攻撃対象の味方がこのパッシブを持つキャラと同じパーティにいるか確認します。
    },
    'char02': (character, allies, enemies) => {
        // 幻惑の霧: 戦闘開始時、敵全体の命中率を少し低下させる。
        // この効果は戦闘開始時に一度だけ適用されます。
        if (character.effects.passiveApplied) return;
        if (enemies) {
            enemies.forEach(enemy => {
                enemy.effects.accuracyDebuff = { duration: Infinity, value: 0.9 }; // 命中率を10%低下
            });
            character.effects.passiveApplied = true; // 一度だけ適用
        }
    },
    'char03': (character) => {
        // 精密射撃: 敵単体への物理攻撃時、クリティカル率が上昇する。
        // ダメージ計算時に適用されるため、ここでは何もしません。
    },
    'char04': (character) => {
        // 影の囁き: ターン開始時、自身の回避率が少し上昇する。
        character.status.dodgeRate = Math.min(0.8, character.status.dodgeRate + 0.05); // 上限80%
    },
    'char05': (character, allies) => {
        // 共鳴する魂: ターン開始時、自身のMPと、ランダムな味方単体のHPを少し回復する。
        character.status.mp = Math.min(character.status.maxMp, character.status.mp + 10);
        if (allies) {
            const aliveAllies = allies.filter(ally => ally.status.hp > 0);
            if (aliveAllies.length > 0) {
                const healTarget = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
                healTarget.status.hp = Math.min(healTarget.status.maxHp, healTarget.status.hp + 15);
            }
        }
    },
    'char06': (character) => {
        // 自己修復プログラム: ターン終了時、自身のHPをわずかに回復する。
        // この処理はターン終了時に行われます。
    },
    'char07': (character) => {
        // 魔剣の共鳴: 物理/魔法攻撃時に確率で追加ダメージ。
        // ダメージ計算時に適用されるため、ここでは何もしません。
    },
    'char08': (character, allies) => {
        // 聖なる祝福: 味方全体の状態異常を毎ターン低確率で回復する。
        if (allies) {
            allies.forEach(ally => {
                if (Math.random() < 0.15) { // 15%の確率
                    // 状態異常を回復するロジック
                    const statusEffects = ['poison', 'stun', 'confusion', 'bleed', 'freeze'];
                    statusEffects.forEach(effect => {
                        if (ally.effects[effect]) {
                            delete ally.effects[effect];
                        }
                    });
                }
            });
        }
    }
};

/**
 * ターン終了時のパッシブ効果
 */
export const endTurnPassiveAbilities = {
    'char06': (character) => {
        // 自己修復プログラム: ターン終了時、自身のHPをわずかに回復する。
        // ただし、HPが0以下の場合は発動しない
        if (character.status.hp <= 0) {
            return null;
        }
        const healAmount = Math.floor(character.status.maxHp * 0.03); // 最大HPの3%回復
        character.status.hp = Math.min(character.status.maxHp, character.status.hp + healAmount);
        return `${character.name}は自己修復で${healAmount}回復した。`;
    }
};

/**
 * 必殺技の発動条件
 * キーはキャラクターID
 * 各関数はプレイヤーオブジェクトと敵リストを引数に取り、条件を満たせばtrueを返します。
 */
export const specialAbilityConditions = {
    'char01': (player) => player.status.mp >= 60,
    'char02': (player) => player.status.mp >= 75,
    'char03': (player) => player.status.mp >= 40,
    'char04': (player) => player.status.mp >= 50,
    'char05': (player) => player.status.mp >= 90,
    'char06': (player) => player.status.mp >= 45,
    'char07': (player) => player.status.mp >= 70,
    'char08': (player, allies) => player.status.mp >= 120 && allies && allies.some(a => a.status.hp <= 0)
};

/**
 * アクティブスキルの効果
 * キーはスキル名
 * 各関数は攻撃者、ターゲット、ダメージ計算関数、ログ関数などを引数に取ります。
 */
export const skillEffects = {
    // 聖騎士リアム
    'ヘブンリーストライク': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, false);
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
        }
        attacker.effects.defBuff = { duration: 3, value: 1.3 }; // 防御力30%アップ
        logMessage(`${attacker.name}の防御力が上昇した！`, 'status-effect');
    },
    'ガーディアンスマイト': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, false);
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
            if (Math.random() < 0.4) { // 40%の確率でスタン
                target.effects.stun = { duration: 1 };
                logMessage(`${target.name}はスタンした！`, 'status-effect');
            }
        }
    },
    'プロテクション': (caster, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        target.effects.defBuff = { duration: 3, value: 1.5 };
        target.effects.mdefBuff = { duration: 3, value: 1.5 };
        logMessage(`${target.name}の物理・魔法防御力が上昇した！`, 'status-effect');
    },

    // 幻術師シエル
    'ミラージュストライク': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, true);
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
            if (Math.random() < 0.3) { // 30%の確率で混乱
                target.effects.confusion = { duration: 2 };
                logMessage(`${target.name}は混乱した！`, 'status-effect');
            }
        }
    },
    'イリュージョンスモーク': (attacker, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, true);
            if (dodged) {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            } else {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
                target.effects.dodgeDebuff = { duration: 3, value: 0.7 }; // 回避率30%低下
                logMessage(`${target.name}の回避率が低下した！`, 'status-effect');
            }
        });
    },
    'マインドコントロール': (caster, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        target.effects.atkDebuff = { duration: 3, value: 0.7 };
        logMessage(`${target.name}の攻撃力が低下した！`, 'status-effect');
    },

    // 弓使いレオン
    'クイックショット': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        for (let i = 0; i < 2; i++) { // 2回攻撃
            const { damage, critical, dodged } = calculateDamage(attacker, target, false);
            if (dodged) {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
                break;
            } else {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
            }
            if (target.status.hp <= 0) break;
        }
    },
    'アローレイン': (attacker, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, false);
            if (dodged) {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            } else {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
            }
        });
    },
    'シャドウスティンガー': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, false);
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
            target.effects.poison = { duration: 3, damage: Math.floor(attacker.status.atk * 0.2) };
            logMessage(`${target.name}は毒状態になった！`, 'status-effect');
        }
    },

    // 暗殺者レナ
    'デスストローク': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        // この攻撃はクリティカル率が高い
        const originalCritRate = attacker.status.criticalRate;
        attacker.status.criticalRate += 0.5;
        const { damage, critical, dodged } = calculateDamage(attacker, target, false);
        attacker.status.criticalRate = originalCritRate;

        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
        }
    },
    'ダブルエッジ': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        for (let i = 0; i < 2; i++) {
            const { damage, critical, dodged } = calculateDamage(attacker, target, false);
            if (dodged) {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
                break;
            } else {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
                if (i === 1 && Math.random() < 0.5) { // 2撃目に確率で出血
                    target.effects.bleed = { duration: 2, damage: Math.floor(attacker.status.atk * 0.3) };
                    logMessage(`${target.name}は出血状態になった！`, 'status-effect');
                }
            }
            if (target.status.hp <= 0) break;
        }
    },
    'ブラインドダガー': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, false);
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
            target.effects.accuracyDebuff = { duration: 3, value: 0.8 }; // 命中率20%低下
            logMessage(`${target.name}の命中率が低下した！`, 'status-effect');
        }
    },

    // 召喚師エレナ
    'フレイムゴースト': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, true);
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
        }
    },
    'フロストスプライト': (attacker, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, true);
            if (dodged) {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            } else {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
                if (Math.random() < 0.3) { // 30%の確率で凍結
                    target.effects.freeze = { duration: 1 };
                    logMessage(`${target.name}は凍結した！`, 'status-effect');
                }
            }
        });
    },
    'ガイアヒーリング': (caster, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const healAmount = Math.floor(caster.status.support * 2.5);
        target.status.hp = Math.min(target.status.maxHp, target.status.hp + healAmount);
        logMessage(`${target.name}は${healAmount}回復した！`, 'heal');
    },

    // 機械兵器ゼノス
    'ガトリングバースト': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        for (let i = 0; i < 3; i++) { // 3回攻撃
            const { damage, critical, dodged } = calculateDamage(attacker, target, false);
            if (dodged) {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
                break;
            } else {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
            }
            if (target.status.hp <= 0) break;
        }
    },
    'ロケットパンチ': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, false);
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
            target.effects.defDebuff = { duration: 3, value: 0.7 }; // 防御力30%低下
            logMessage(`${target.name}の防御力が低下した！`, 'status-effect');
        }
    },
    'グラビティフィールド': (caster, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            target.effects.spdDebuff = { duration: 3, value: 0.6 }; // 素早さ40%低下
            logMessage(`${target.name}の素早さが低下した！`, 'status-effect');
        });
    },

    // 魔剣士ヴァイス
    'エナジースラッシュ': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        // 物理ダメージ
        const { damage: physicalDamage, critical: physicalCritical, dodged: physicalDodged } = calculateDamage(attacker, target, false);
        // 魔法ダメージ
        const { damage: magicalDamage, critical: magicalCritical, dodged: magicalDodged } = calculateDamage(attacker, target, true);
        
        if (physicalDodged && magicalDodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            let totalDamage = 0;
            if (!physicalDodged) {
                if (physicalCritical) logMessage(`物理攻撃が会心の一撃！`, 'special-event');
                totalDamage += physicalDamage;
            }
            if (!magicalDodged) {
                if (magicalCritical) logMessage(`魔法攻撃が会心の一撃！`, 'special-event');
                totalDamage += magicalDamage;
            }
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${totalDamage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - totalDamage);
        }
    },
    'カオスブレイク': (attacker, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, false);
            if (dodged) {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            } else {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
                if (Math.random() < 0.25) { // 25%の確率で行動不能
                    target.effects.stun = { duration: 1 };
                    logMessage(`${target.name}は行動不能になった！`, 'status-effect');
                }
            }
        });
    },
    'シャドウバインド': (caster, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        target.effects.spdDebuff = { duration: 3, value: 0.5 }; // 素早さ50%低下
        target.effects.bind = { duration: 2 }; // 拘束状態
        logMessage(`${target.name}は闇の鎖で拘束された！`, 'status-effect');
    },

    // 神官エリス
    'メディックウェーブ': (caster, targets, calculateDamage, logMessage) => {
        const healAmount = Math.floor(caster.status.support * 1.5);
        targets.forEach(target => {
            target.status.hp = Math.min(target.status.maxHp, target.status.hp + healAmount);
            // 状態異常を治癒
            const statusEffects = ['poison', 'stun', 'confusion', 'bleed', 'freeze'];
            statusEffects.forEach(effect => {
                if (target.effects[effect]) {
                    delete target.effects[effect];
                }
            });
            logMessage(`${target.name}は${healAmount}回復し、状態異常が治癒した！`, 'heal');
        });
    },
    'リフレッシュ': (caster, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const hpHealAmount = Math.floor(caster.status.support * 3);
        const mpHealAmount = Math.floor(caster.status.support * 2);
        target.status.hp = Math.min(target.status.maxHp, target.status.hp + hpHealAmount);
        target.status.mp = Math.min(target.status.maxMp, target.status.mp + mpHealAmount);
        logMessage(`${target.name}はHP${hpHealAmount}、MP${mpHealAmount}回復した！`, 'heal');
    },
    'サイレントホーン': (caster, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        target.effects.silence = { duration: 3 }; // 魔法封印
        target.effects.spdDebuff = { duration: 2, value: 0.8 }; // 素早さ20%低下
        logMessage(`${target.name}は沈黙状態になった！`, 'status-effect');
    },

    // 必殺技
    'ホーリーランス': (attacker, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, false, 2.5); // 2.5倍ダメージ
            if (dodged) {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            } else {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の必殺技！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
            }
        });
    },
    'ナイトメア': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, true, 3.0); // 3倍ダメージ
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の必殺技！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
            target.effects.stun = { duration: 2 }; // 2ターン行動不能
            logMessage(`${target.name}は恐怖で行動不能になった！`, 'status-effect');
        }
    },
    'エリアルストライク': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, false, 4.0); // 4倍ダメージ
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の必殺技！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
        }
    },
    'シャドウバースト': (attacker, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, false, 2.0); // 2倍ダメージ
            if (dodged) {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            } else {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の必殺技！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
            }
        });
    },
    'アストラルゲート': (attacker, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, true, 3.5); // 3.5倍ダメージ
            if (dodged) {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            } else {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の必殺技！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
            }
        });
    },
    'オーバードライブ': (caster, targets, calculateDamage, logMessage) => {
        caster.effects.atkBuff = { duration: 4, value: 2.0 }; // 攻撃力2倍
        caster.effects.defBuff = { duration: 4, value: 1.5 }; // 防御力1.5倍
        caster.effects.spdBuff = { duration: 4, value: 1.8 }; // 素早さ1.8倍
        logMessage(`${caster.name}はオーバードライブ状態になった！`, 'status-effect');
    },
    'デュアル・エクスプロージョン': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        // 物理攻撃力と魔法攻撃力を乗算したダメージ
        const specialDamage = Math.floor(attacker.status.atk * attacker.status.matk / 10);
        logMessage(`${attacker.name}の必殺技！ ${target.name}に${specialDamage}のダメージ！`, 'damage');
        target.status.hp = Math.max(0, target.status.hp - specialDamage);
    },
    '天国の扉': (caster, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            if (target.status.hp <= 0) {
                target.status.hp = target.status.maxHp;
                target.status.mp = target.status.maxMp;
                logMessage(`${target.name}が完全復活した！`, 'heal');
            }
        });
    }
};

/**
 * ダメージ計算時のパッシブ効果適用
 */
export const damagePassiveEffects = {
    'char01': (attacker, target, damage, isPhysical) => {
        // 不屈の守護: 自身以外の味方全体が受ける物理ダメージを10%軽減
        if (isPhysical && target.partyType === attacker.partyType && target.uniqueId !== attacker.uniqueId) {
            // 同じパーティに聖騎士リアムがいるかチェック
            const allies = window.currentPlayerParty || [];
            const hasGuardian = allies.some(ally => ally.originalId === 'char01' && ally.status.hp > 0);
            if (hasGuardian) {
                return Math.floor(damage * 0.9); // 10%軽減
            }
        }
        return damage;
    },
    'char03': (attacker, target, damage, isPhysical) => {
        // 精密射撃: 敵単体への物理攻撃時、クリティカル率が上昇
        // この効果はクリティカル判定時に適用されるため、ここでは何もしません
        return damage;
    },
    'char07': (attacker, target, damage, isPhysical) => {
        // 魔剣の共鳴: 物理攻撃時に確率で魔法ダメージを追加、魔法攻撃時に確率で物理ダメージを追加
        if (Math.random() < 0.3) { // 30%の確率
            const additionalDamage = isPhysical ? 
                Math.floor(attacker.status.matk * 0.8) : 
                Math.floor(attacker.status.atk * 0.8);
            return damage + additionalDamage;
        }
        return damage;
    }
};

/**
 * クリティカル率計算時のパッシブ効果
 */
export const criticalPassiveEffects = {
    'char03': (attacker, target, baseCritRate) => {
        // 精密射撃: 敵単体への物理攻撃時、クリティカル率が上昇
        return baseCritRate + 0.2; // クリティカル率20%上昇
    }
};
