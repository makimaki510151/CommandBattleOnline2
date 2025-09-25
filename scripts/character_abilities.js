// character_abilities.js (更新版)

/**
 * パッシブ能力のロジック
 * キーはキャラクターID (char01, char02, etc.)
 * 各関数はキャラクターオブジェクトを引数に取り、ターン開始時に適用される効果を処理します。
 */
export const passiveAbilities = {
    'char01': (character, allies, enemies) => {
        // 絶対の守護: 自身が受ける単体攻撃のダメージを15%軽減する。（ダメージ計算時に適用）
    },
    'char02': (character, allies, enemies) => {
        // 広域カバー: 自身以外の味方全体が受ける全体攻撃のダメージを15%軽減する。（ダメージ計算時に適用）
    },
    'char03': (character, allies) => {
        // 調和の旋律: 毎ターン開始時、ランダムな味方単体の攻撃力か魔法攻撃力を上昇させる。
        if (allies) {
            const aliveAllies = allies.filter(ally => ally.status.hp > 0);
            if (aliveAllies.length > 0) {
                const target = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
                const buffType = Math.random() < 0.5 ? 'atkBuff' : 'matkBuff';
                target.effects[buffType] = { duration: 2, value: 1.2 }; // 攻撃力/魔攻20%アップ
                console.log(`${character.name}の調和の旋律で${target.name}の${buffType === 'atkBuff' ? '攻撃力' : '魔攻'}が上昇した！`);
            }
        }
    },
    'char04': (character, allies) => {
        // 祈りの光: 回復魔法の効果が10%上昇する。（スキル効果の計算時に適用）
    },
    'char05': (character) => {
        // 魔力の泉: 自身のMP回復量が15%上昇する。
        character.status.mp = Math.min(character.status.maxMp, character.status.mp + Math.floor(character.status.maxMp * 0.05 * 1.15)); // 基礎MP回復量（仮に最大MPの5%）に15%ボーナス
    },
    'char06': (character, allies, enemies) => {
        // 怨嗟の波動: 自身のデバフ効果の付与確率が上昇する。（スキル効果の計算時に適用）
    },
    'char07': (character) => {
        // 孤高の刃: 敵単体への攻撃時、ダメージが15%上昇する。（ダメージ計算時に適用）
    },
    'char08': (character, allies, enemies) => {
        // 炎の残滓: 全体魔法攻撃時、確率で敵全体を火傷状態にする。（スキル効果の計算時に適用）
    }
};

/**
 * ターン終了時のパッシブ効果
 */
export const endTurnPassiveAbilities = {
    // 新キャラにはターン終了時発動のパッシブはありません。
};

/**
 * 必殺技の発動条件
 */
export const specialAbilityConditions = {
    'char01': (player) => player.status.mp >= 50,
    'char02': (player) => player.status.mp >= 40,
    'char03': (player) => player.status.mp >= 60,
    'char04': (player) => player.status.mp >= 80,
    'char05': (player) => player.status.mp >= 60,
    'char06': (player) => player.status.mp >= 70,
    'char07': (player) => player.status.mp >= 60,
    'char08': (player) => player.status.mp >= 75
};

/**
 * アクティブスキルの効果
 */
export const skillEffects = {
    // 鉄壁の騎士ゼイド
    'ランパート': (caster, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        target.effects.taunt = { duration: 1, to: caster.uniqueId }; // 次の単体攻撃をゼイドに引き付ける
        logMessage(`${caster.name}が${target.name}を護るため、次の攻撃を引き付けた！`, 'status-effect');
    },
    'シールドバッシュ': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, false);
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
            if (Math.random() < 0.4) { // 40%の確率で行動順を遅らせる（spdDebuffで代用）
                target.effects.spdDebuff = { duration: 1, value: 0.5 };
                logMessage(`${target.name}の行動順が遅れた！`, 'status-effect');
            }
        }
    },
    'ストロングガード': (caster, targets, calculateDamage, logMessage) => {
        caster.effects.defBuff = { duration: 3, value: 1.5 };
        caster.effects.mdefBuff = { duration: 3, value: 1.5 };
        logMessage(`${caster.name}の物理・魔法防御力が大幅に上昇した！`, 'status-effect');
    },

    // 大地戦士ゴルム
    'プロヴォーク': (caster, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            target.effects.taunt = { duration: 2, to: caster.uniqueId, all: true }; // 2ターン全体攻撃を引き付ける（全て自身へ）
        });
        logMessage(`${caster.name}が敵全体を挑発し、攻撃を引き付けた！`, 'status-effect');
    },
    'アースクエイク': (attacker, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, false);
            if (!dodged) {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
                if (Math.random() < 0.3) { // 30%の確率で素早さ低下
                    target.effects.spdDebuff = { duration: 2, value: 0.7 };
                    logMessage(`${target.name}の素早さが低下した！`, 'status-effect');
                }
            } else {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            }
        });
    },
    '自己再生': (caster, targets, calculateDamage, logMessage) => {
        const healAmount = Math.floor(caster.status.maxHp * 0.15); // 最大HPの15%回復
        caster.status.hp = Math.min(caster.status.maxHp, caster.status.hp + healAmount);
        logMessage(`${caster.name}は自己再生で${healAmount}回復した。`, 'heal');
    },

    // 風の歌い手ミサ
    'ブレイブソング': (caster, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            target.effects.atkBuff = { duration: 3, value: 1.3 }; // 攻撃力30%アップ
        });
        logMessage(`${caster.name}は味方全体の物理攻撃力を上昇させた！`, 'status-effect');
    },
    'マジックコーラス': (caster, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            target.effects.matkBuff = { duration: 3, value: 1.3 }; // 魔攻30%アップ
        });
        logMessage(`${caster.name}は味方全体の魔法攻撃力を上昇させた！`, 'status-effect');
    },
    'スピードアップ': (caster, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        target.effects.spdBuff = { duration: 3, value: 1.6 }; // 素早さ60%アップ
        logMessage(`${target.name}の素早さが大幅に上昇した！`, 'status-effect');
    },

    // 慈愛の聖女ルナ
    'ハイヒール': (caster, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const passiveBonus = caster.originalId === 'char04' ? 1.1 : 1.0;
        const healAmount = Math.floor(caster.status.support * 3.0 * passiveBonus);
        target.status.hp = Math.min(target.status.maxHp, target.status.hp + healAmount);
        logMessage(`${target.name}は${healAmount}回復した！`, 'heal');
    },
    'エリアヒール': (caster, targets, calculateDamage, logMessage) => {
        const passiveBonus = caster.originalId === 'char04' ? 1.1 : 1.0;
        const healAmount = Math.floor(caster.status.support * 1.8 * passiveBonus);
        targets.forEach(target => {
            target.status.hp = Math.min(target.status.maxHp, target.status.hp + healAmount);
        });
        logMessage(`味方全体が${healAmount}回復した！`, 'heal');
    },
    'リザレクション': (caster, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        if (target.status.hp <= 0) {
            target.status.hp = Math.floor(target.status.maxHp * 0.5); // HPを半分にして復活
            // 他の状態をリセット
            target.effects = {};
            logMessage(`${target.name}がHP半分で復活した！`, 'heal');
        } else {
            logMessage(`${target.name}は戦闘不能ではないため効果なし。`, 'info');
        }
    },

    // 魔力供給者アルト
    'マナチャージ': (caster, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const mpHealAmount = Math.floor(caster.status.support * 2.5);
        target.status.mp = Math.min(target.status.maxMp, target.status.mp + mpHealAmount);
        logMessage(`${target.name}のMPが${mpHealAmount}回復した！`, 'heal');
    },
    'エナジーフロー': (caster, targets, calculateDamage, logMessage) => {
        const mpHealAmount = Math.floor(caster.status.support * 1.5);
        targets.forEach(target => {
            target.status.mp = Math.min(target.status.maxMp, target.status.mp + mpHealAmount);
        });
        logMessage(`味方全体のMPが${mpHealAmount}回復した！`, 'heal');
    },
    'マナドレイン': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, true, 0.5); // 0.5倍の威力
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);

            const mpHealAmount = Math.floor(damage / 2); // 与えたダメージの半分MP回復
            attacker.status.mp = Math.min(attacker.status.maxMp, attacker.status.mp + mpHealAmount);
            logMessage(`${attacker.name}のMPが${mpHealAmount}回復した！`, 'heal');
        }
    },

    // 呪術師アザミ
    'ウィークネス': (caster, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        target.effects.atkDebuff = { duration: 3, value: 0.7 }; // 攻撃力30%低下
        target.effects.matkDebuff = { duration: 3, value: 0.7 }; // 魔攻30%低下
        logMessage(`${target.name}の物理・魔法攻撃力が低下した！`, 'status-effect');
    },
    'スローカース': (attacker, targets, calculateDamage, logMessage) => {
        const debuffChance = attacker.originalId === 'char06' ? 0.45 : 0.3; // 怨嗟の波動適用
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, true, 0.8);
            if (!dodged) {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
                if (Math.random() < debuffChance) {
                    target.effects.spdDebuff = { duration: 3, value: 0.6 }; // 素早さ40%低下
                    logMessage(`${target.name}の素早さが低下した！`, 'status-effect');
                }
            } else {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            }
        });
    },
    'ヴェノムボム': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, true);
        const poisonChance = attacker.originalId === 'char06' ? 0.75 : 0.5; // 怨嗟の波動適用
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
            if (Math.random() < poisonChance) {
                target.effects.poison = { duration: 3, damage: Math.floor(attacker.status.matk * 0.3) };
                logMessage(`${target.name}は毒状態になった！`, 'status-effect');
            }
        }
    },

    // 一撃の剣士カイ
    'ブレイクスルー': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, false, 1.5, true); // 1.5倍ダメージ、防御無視フラグを立てる
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！ (防御無視)`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
        }
    },
    'ラピッドストライク': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        for (let i = 0; i < 2; i++) { // 2回攻撃
            const { damage, critical, dodged } = calculateDamage(attacker, target, false, 0.8); // 0.8倍の威力
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
    'チャージアップ': (caster, targets, calculateDamage, logMessage) => {
        caster.effects.atkBuff = { duration: 2, value: 1.5 }; // 攻撃力50%アップ
        logMessage(`${caster.name}の物理攻撃力が大幅に上昇した！`, 'status-effect');
    },

    // 業火の魔女イヴ
    'ファイアストーム': (attacker, targets, calculateDamage, logMessage) => {
        const burnChance = attacker.originalId === 'char08' ? 0.35 : 0.2; // 炎の残滓適用
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, true);
            if (!dodged) {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
                if (Math.random() < burnChance) { // 確率で火傷
                    target.effects.burn = { duration: 3, damage: Math.floor(attacker.status.matk * 0.1) };
                    logMessage(`${target.name}は火傷状態になった！`, 'status-effect');
                }
            } else {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            }
        });
    },
    'ヒートウェーブ': (attacker, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, true, 0.9);
            if (!dodged) {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
                if (Math.random() < 0.3) { // 30%の確率で防御力低下
                    target.effects.defDebuff = { duration: 2, value: 0.7 };
                    logMessage(`${target.name}の防御力が低下した！`, 'status-effect');
                }
            } else {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            }
        });
    },
    'バーニングアロー': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, true);
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の攻撃！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
            target.effects.burn = { duration: 3, damage: Math.floor(attacker.status.matk * 0.2) };
            logMessage(`${target.name}は火傷状態になった！`, 'status-effect');
        }
    },

    // 必殺技 (新キャラ)
    'ソリッドウォール': (caster, targets, calculateDamage, logMessage) => {
        caster.effects.invulnerable = { duration: 1 }; // 1ターン無敵
        logMessage(`${caster.name}はソリッドウォールを展開し、全てのダメージを無効化した！`, 'special-event');
    },
    'ガイアシェル': (caster, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            target.effects.defBuff = { duration: 2, value: 1.25 }; // 防御力25%アップ
            target.effects.mdefBuff = { duration: 2, value: 1.25 }; // 魔法防御力25%アップ
        });
        logMessage(`味方全体にガイアシェルの加護がかかった！`, 'status-effect');
    },
    'ハーモニー': (caster, targets, calculateDamage, logMessage) => {
        const healAmount = Math.floor(caster.status.support * 1.0); // わずかにHP回復
        targets.forEach(target => {
            target.status.hp = Math.min(target.status.maxHp, target.status.hp + healAmount);
            // 全ての状態異常を治癒
            target.effects = {};
        });
        logMessage(`味方全体の状態異常が治癒し、HPが回復した！`, 'heal');
    },
    'ライフセーバー': (caster, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        target.status.hp = target.status.maxHp;
        // 全てのデバフを治癒
        target.effects = {};
        logMessage(`${target.name}のHPが完全に回復し、全てのデバフが治癒した！`, 'heal');
    },
    'エターナルマナ': (caster, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            target.status.mp = target.status.maxMp;
        });
        caster.status.mp = Math.min(caster.status.maxMp, caster.status.mp + Math.floor(caster.status.maxMp * 0.5)); // 自身もMPを50%回復
        logMessage(`味方全体のMPが完全に回復した！`, 'heal');
    },
    'デスタッチ': (attacker, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, true, 1.5);
            if (!dodged) {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の必殺技！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
                target.effects.defDebuff = { duration: 3, value: 0.5 }; // 防御力50%低下
                target.effects.mdefDebuff = { duration: 3, value: 0.5 }; // 魔防50%低下
                logMessage(`${target.name}の防御力が大幅に低下した！`, 'status-effect');
            } else {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            }
        });
    },
    'ディメンションスラッシュ': (attacker, targets, calculateDamage, logMessage) => {
        const target = targets[0];
        const { damage, critical, dodged } = calculateDamage(attacker, target, false, 3.0); // 3倍ダメージ
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の必殺技！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
            if (Math.random() < 0.3) { // 30%の確率で即死 (HPを0に)
                if (target.status.hp > 0) {
                    target.status.hp = 0;
                    logMessage(`${target.name}は一撃で仕留められた！`, 'special-event');
                }
            }
        }
    },
    'メテオフォール': (attacker, targets, calculateDamage, logMessage) => {
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, true, 2.5); // 2.5倍ダメージ
            if (!dodged) {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の必殺技！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
            } else {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            }
        });
    }
};

/**
 * ダメージ計算時のパッシブ効果適用
 */
export const damagePassiveEffects = {
    'char01': (attacker, target, damage, isPhysical, skillTarget) => {
        // 絶対の守護: 自身が受ける単体攻撃のダメージを15%軽減
        if (target.originalId === 'char01' && skillTarget === 'single') {
            return Math.floor(damage * 0.85); // 15%軽減
        }
        return damage;
    },
    'char02': (attacker, target, damage, isPhysical, skillTarget) => {
        // 広域カバー: 自身以外の味方全体が受ける全体攻撃のダメージを15%軽減
        if (target.originalId !== 'char02' && skillTarget === 'all_enemies') {
            // 同じパーティに大地戦士ゴルムがいるかチェック（ここは実際のゲームロジックに依存）
            // 仮にゴルムが生存していれば発動とします
            return Math.floor(damage * 0.85); // 15%軽減
        }
        return damage;
    },
    'char07': (attacker, target, damage, isPhysical, skillTarget) => {
        // 孤高の刃: 敵単体への攻撃時、ダメージが15%上昇する
        if (attacker.originalId === 'char07' && skillTarget === 'single') {
            return Math.floor(damage * 1.15); // 15%上昇
        }
        return damage;
    }
};

/**
 * クリティカル率計算時のパッシブ効果
 */
export const criticalPassiveEffects = {
    // 新キャラにはクリティカル率に影響するパッシブはありません。
};