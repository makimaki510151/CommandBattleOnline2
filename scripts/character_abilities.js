// character_abilities.js (更新版)

import { skillData } from './skillDefinitions.js';

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
        // 魔力の泉: 自身のMP回復量が15%上昇する。（MP回復スキル適用時に計算）
    },
    'char06': (character, allies, enemies, logMessage) => {
        // 怨嗟の波動: ターン開始時に敵全体に1ターンのデバフを付与
        if (!enemies || enemies.length === 0) return;
        const aliveEnemies = enemies.filter(e => e.status?.hp > 0);
        if (aliveEnemies.length === 0) return;
        const types = [
            { key: 'atkMatk', apply: (t) => { t.effects.atkDebuff = { duration: 1, value: 0.7 }; t.effects.matkDebuff = { duration: 1, value: 0.7 }; }, msg: '攻撃力＆魔法力' },
            { key: 'defMdef', apply: (t) => { t.effects.defDebuff = { duration: 1, value: 0.7 }; t.effects.mdefDebuff = { duration: 1, value: 0.7 }; }, msg: '防御力＆魔法防御力' },
            { key: 'dodge', apply: (t) => { t.effects.dodgeDebuff = { duration: 1, value: 0.5 }; }, msg: '回避率' }
        ];
        const chosen = types[Math.floor(Math.random() * types.length)];
        aliveEnemies.forEach(t => chosen.apply(t));
        if (logMessage) logMessage(`${character.name}の怨嗟の波動！ 敵全体の${chosen.msg}が1ターン低下した。`, 'status-effect');
    },
    'char07': (character) => {
        // 孤高の刃: 敵単体への攻撃時、ダメージが15%上昇する。（ダメージ計算時に適用）
    },
    'char08': (character, allies, enemies) => {
        // 炎の残滓: 全体魔法攻撃時、確率で敵全体を火傷状態にする。（スキル効果の計算時に適用）
    }
};

function applyHeal(caster, baseAmount) {
    return Math.floor(baseAmount);
}

function applyMpHealWithTempMp(caster, target, baseAmount) {
    // 魔力の泉（char05）：余剰分50%が一時的追加MP
    const mpNeed = Math.max(0, target.status.maxMp - target.status.mp);
    const toMp = Math.min(baseAmount, mpNeed);
    const excess = Math.max(0, baseAmount - mpNeed);
    const toTempMp = caster?.originalId === 'char05' ? Math.floor(excess * 0.5) : 0;
    target.status.mp = Math.min(target.status.maxMp, target.status.mp + toMp);
    target.status.tempMp = (target.status.tempMp || 0) + toTempMp;
    return toMp + toTempMp;
}

/**
 * ターン終了時のパッシブ効果
 */
export const endTurnPassiveAbilities = {
    // 新キャラにはターン終了時発動のパッシブはありません。
};

/**
 * 必殺技の発動条件（必殺技無効化時は空。復活時はコメントを外す）
 */
// export const specialAbilityConditions = {
//     'char01': (player) => player.status.mp >= 50,
//     'char02': (player) => player.status.mp >= 40,
//     'char03': (player) => player.status.mp >= 60,
//     'char04': (player) => player.status.mp >= 80,
//     'char05': (player) => player.status.mp >= 60,
//     'char06': (player) => player.status.mp >= 70,
//     'char07': (player) => player.status.mp >= 60,
//     'char08': (player) => player.status.mp >= 75
// };
export const specialAbilityConditions = {};

/**
 * アクティブスキルの効果
 */
export const skillEffects = {
    // 鉄壁の騎士ゼイド
    'ランパート': (caster, targets, calculateDamage, logMessage, skill) => {
        const target = targets[0];
        const d = skillData[skill.name];
        target.effects.taunt = { duration: d.duration, to: caster.uniqueId };
        caster.effects.guarding = { duration: d.duration, damageReduction: d.damageReduction || 0 };
        logMessage(`${caster.name}は${skill.name}で${target.name}を護り、攻撃を引き付けた！`, 'status-effect');
    },
    'シールドバッシュ': (attacker, targets, calculateDamage, logMessage, skill) => {
        const target = targets[0];
        const d = skillData[skill.name];
        const { damage, critical, dodged } = calculateDamage(attacker, target, false, d.power, false, 'single', d.powerRef === 'def');
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の${skill.name}！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
            const proc = d.proc;
            if (proc && Math.random() < proc.chance) {
                target.effects[proc.effect] = { duration: proc.duration, value: proc.value };
                logMessage(`${target.name}の行動順が遅れた！`, 'status-effect');
            }
        }
    },
    'ストロングガード': (caster, targets, calculateDamage, logMessage, skill) => {
        const d = skillData[skill.name];
        d.buffs.forEach(b => { caster.effects[b.stat === 'def' ? 'defBuff' : 'mdefBuff'] = { duration: d.duration, value: b.value }; });
        logMessage(`${caster.name}は${skill.name}で物理・魔法防御力が大幅に上昇した！`, 'status-effect');
    },

    // 大地戦士ゴルム
    'プロヴォーク': (caster, targets, calculateDamage, logMessage, skill) => {
        const d = skillData[skill.name];
        const maxR = d.maxRedirects ?? 999;
        targets.forEach(target => {
            target.effects.taunt = { duration: d.duration, to: caster.uniqueId, all: true, remaining: maxR };
        });
        logMessage(`${caster.name}は${skill.name}で敵全体を挑発し、攻撃を引き付けた！`, 'status-effect');
    },
    'アースクエイク': (attacker, targets, calculateDamage, logMessage, skill) => {
        const d = skillData[skill.name];
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, false, d.power);
            if (!dodged) {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の${skill.name}！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
                const proc = d.proc;
                if (proc && Math.random() < proc.chance) {
                    target.effects[proc.effect] = { duration: proc.duration, value: proc.value };
                    logMessage(`${target.name}の素早さが低下した！`, 'status-effect');
                }
            } else {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            }
        });
    },
    '自己再生': (caster, targets, calculateDamage, logMessage, skill) => {
        const d = skillData[skill.name];
        const healAmount = Math.floor(caster.status.maxHp * d.healRatio);
        caster.status.hp = Math.min(caster.status.maxHp, caster.status.hp + healAmount);
        logMessage(`${caster.name}は${skill.name}で${healAmount}回復した。`, 'heal');
    },

    // 風の歌い手ミサ
    'ブレイブソング': (caster, targets, calculateDamage, logMessage, skill) => {
        const d = skillData[skill.name];
        targets.forEach(target => {
            d.buffs.forEach(b => { target.effects[b.stat + 'Buff'] = { duration: d.duration, value: b.value }; });
        });
        logMessage(`${caster.name}は${skill.name}で味方全体の物理攻撃力を上昇させた！`, 'status-effect');
    },
    'マジックコーラス': (caster, targets, calculateDamage, logMessage, skill) => {
        const d = skillData[skill.name];
        targets.forEach(target => {
            d.buffs.forEach(b => { target.effects[b.stat + 'Buff'] = { duration: d.duration, value: b.value }; });
        });
        logMessage(`${caster.name}は${skill.name}で味方全体の魔法攻撃力を上昇させた！`, 'status-effect');
    },
    'スピードアップ': (caster, targets, calculateDamage, logMessage, skill) => {
        const target = targets[0];
        const d = skillData[skill.name];
        d.buffs.forEach(b => { target.effects[b.stat + 'Buff'] = { duration: d.duration, value: b.value }; });
        logMessage(`${caster.name}は${skill.name}で${target.name}の素早さを大幅に上昇させた！`, 'status-effect');
    },

    // 慈愛の聖女ルナ
    'ハイヒール': (caster, targets, calculateDamage, logMessage, skill) => {
        const target = targets[0];
        const d = skillData[skill.name];
        const healAmount = applyHeal(caster, caster.status.support * d.supportMul);
        target.status.hp = Math.min(target.status.maxHp, target.status.hp + healAmount);
        logMessage(`${caster.name}は${skill.name}で${target.name}を${healAmount}回復した！`, 'heal');
        if (caster.originalId === 'char04') {
            const selfHeal = Math.floor(healAmount * 0.1);
            caster.status.hp = Math.min(caster.status.maxHp, caster.status.hp + selfHeal);
            if (selfHeal > 0) logMessage(`${caster.name}は祈りの光で${selfHeal}回復した！`, 'heal');
        }
    },
    'エリアヒール': (caster, targets, calculateDamage, logMessage, skill) => {
        const d = skillData[skill.name];
        const healAmount = applyHeal(caster, caster.status.support * d.supportMul);
        let totalHealed = 0;
        targets.forEach(target => {
            target.status.hp = Math.min(target.status.maxHp, target.status.hp + healAmount);
            totalHealed += healAmount;
        });
        logMessage(`${caster.name}は${skill.name}で味方全体を${healAmount}回復した！`, 'heal');
        if (caster.originalId === 'char04' && totalHealed > 0) {
            const selfHeal = Math.floor(totalHealed * 0.1);
            caster.status.hp = Math.min(caster.status.maxHp, caster.status.hp + selfHeal);
            if (selfHeal > 0) logMessage(`${caster.name}は祈りの光で${selfHeal}回復した！`, 'heal');
        }
    },
    'リザレクション': (caster, targets, calculateDamage, logMessage, skill) => {
        const target = targets[0];
        const d = skillData[skill.name];
        if (target.status.hp <= 0) {
            target.status.hp = Math.floor(target.status.maxHp * d.reviveRatio);
            target.effects = {};
            logMessage(`${caster.name}は${skill.name}で${target.name}をHP半分で復活させた！`, 'heal');
        } else {
            logMessage(`${target.name}は戦闘不能ではないため効果なし。`, 'info');
        }
    },

    // 魔力供給者アルト
    'マナチャージ': (caster, targets, calculateDamage, logMessage, skill) => {
        const target = targets[0];
        const d = skillData[skill.name];
        const mpHealAmount = Math.floor(caster.status.support * d.supportMul);
        const finalAmount = applyMpHealWithTempMp(caster, target, mpHealAmount);
        logMessage(`${caster.name}は${skill.name}で${target.name}のMPを${finalAmount}回復した！`, 'heal');
    },
    'エナジーフロー': (caster, targets, calculateDamage, logMessage, skill) => {
        const d = skillData[skill.name];
        const mpHealAmount = Math.floor(caster.status.support * d.supportMul);
        targets.forEach(target => {
            applyMpHealWithTempMp(caster, target, mpHealAmount);
        });
        logMessage(`${caster.name}は${skill.name}で味方全体のMPを回復した！`, 'heal');
    },
    'マナドレイン': (attacker, targets, calculateDamage, logMessage, skill) => {
        const target = targets[0];
        const d = skillData[skill.name];
        const { damage, critical, dodged } = calculateDamage(attacker, target, d.isMagic, d.power);
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の${skill.name}！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);

            const mpHealAmount = Math.floor(damage * d.mpStealRatio);
            attacker.status.mp = Math.min(attacker.status.maxMp, attacker.status.mp + mpHealAmount);
            logMessage(`${attacker.name}のMPが${mpHealAmount}回復した！`, 'heal');
        }
    },

    // 呪術師アザミ
    'ウィークネス': (caster, targets, calculateDamage, logMessage, skill) => {
        const target = targets[0];
        const d = skillData[skill.name];
        d.debuffs.forEach(b => { target.effects[b.stat + 'Debuff'] = { duration: d.duration, value: b.value }; });
        logMessage(`${caster.name}は${skill.name}で${target.name}の物理・魔法防御力を低下させた！`, 'status-effect');
    },
    'スローカース': (attacker, targets, calculateDamage, logMessage, skill) => {
        const d = skillData[skill.name];
        const proc = d.proc;
        const debuffChance = proc?.chance ?? 1;
        targets.forEach(target => {
            const { damage, critical, dodged } = calculateDamage(attacker, target, d.isMagic, d.power);
            if (!dodged) {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の${skill.name}！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
                if (proc && Math.random() < debuffChance) {
                    target.effects[proc.effect] = { duration: proc.duration, value: proc.value };
                    logMessage(`${target.name}の素早さが低下した！`, 'status-effect');
                }
            } else {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            }
        });
    },
    'ヴェノムボム': (attacker, targets, calculateDamage, logMessage, skill) => {
        const target = targets[0];
        const d = skillData[skill.name];
        const proc = d.proc;
        const poisonChance = proc?.chance ?? 1;
        const { damage, critical, dodged } = calculateDamage(attacker, target, d.isMagic, d.power);
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の${skill.name}！ ${target.name}に${damage}のダメージ！`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
            if (proc && Math.random() < poisonChance) {
                target.effects.poison = { duration: proc.duration, damage: Math.floor(attacker.status.matk * 0.3) };
                logMessage(`${target.name}は毒状態になった！`, 'status-effect');
            }
        }
    },

    // 一撃の剣士カイ
    'ブレイクスルー': (attacker, targets, calculateDamage, logMessage, skill) => {
        const target = targets[0];
        const d = skillData[skill.name];
        const { damage, critical, dodged } = calculateDamage(attacker, target, false, d.power, d.ignoreDefense);
        if (dodged) {
            logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
        } else {
            if (critical) logMessage(`会心の一撃！`, 'special-event');
            logMessage(`${attacker.name}の${skill.name}！ ${target.name}に${damage}のダメージ！ (防御無視)`, 'damage');
            target.status.hp = Math.max(0, target.status.hp - damage);
        }
    },
    'ラピッドストライク': (attacker, targets, calculateDamage, logMessage, skill) => {
        const target = targets[0];
        const d = skillData[skill.name];
        for (let i = 0; i < (d.hits || 2); i++) {
            const { damage, critical, dodged } = calculateDamage(attacker, target, false, d.power);
            if (dodged) {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
                break;
            } else {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の${skill.name}！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
            }
            if (target.status.hp <= 0) break;
        }
    },
    'チャージアップ': (caster, targets, calculateDamage, logMessage, skill) => {
        const d = skillData[skill.name];
        d.buffs.forEach(b => {
            if (b.stat === 'critRate') {
                caster.effects.critRateBuff = { duration: d.duration, value: b.value };
            } else {
                caster.effects[b.stat + 'Buff'] = { duration: d.duration, value: b.value };
            }
        });
        logMessage(`${caster.name}は${skill.name}で物理攻撃力と会心率が上昇した！`, 'status-effect');
    },

    // 業火の魔女イヴ
    'ファイアストーム': (attacker, targets, calculateDamage, logMessage, skill) => {
        const d = skillData[skill.name];
        const enemies = targets.filter(t => t.status.hp > 0);
        const hits = d.hits ?? 6;
        for (let i = 0; i < hits; i++) {
            if (enemies.length === 0) break;
            const idx = Math.floor(Math.random() * enemies.length);
            const target = enemies[idx];
            const { damage, critical, dodged } = calculateDamage(attacker, target, d.isMagic, d.power, false, 'single');
            if (dodged) {
                logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
            } else {
                if (critical) logMessage(`会心の一撃！`, 'special-event');
                logMessage(`${attacker.name}の${skill.name}！ ${target.name}に${damage}のダメージ！`, 'damage');
                target.status.hp = Math.max(0, target.status.hp - damage);
            }
            if (target.status.hp <= 0) enemies.splice(idx, 1);
        }
    },
    'バーンバーン': (attacker, targets, calculateDamage, logMessage, skill) => {
        const d = skillData[skill.name];
        targets.forEach(target => {
            if (target.status.hp <= 0) return;
            if (target.effects?.burn) {
                const { damage, critical, dodged } = calculateDamage(attacker, target, d.isMagic, d.power, false, 'single');
                if (!dodged) {
                    if (critical) logMessage(`会心の一撃！`, 'special-event');
                    logMessage(`${attacker.name}の${skill.name}！ ${target.name}のやけどが爆発！ ${damage}のダメージ！`, 'damage');
                    target.status.hp = Math.max(0, target.status.hp - damage);
                } else {
                    logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
                }
                delete target.effects.burn;
            }
        });
    },
    'バーニングアロー': (attacker, targets, calculateDamage, logMessage, skill) => {
        const d = skillData[skill.name];
        const proc = d.proc;
        const burnChance = proc?.chance ?? 0.2;
        const hits = d.hits ?? 3;
        for (let hit = 0; hit < hits; hit++) {
            targets.forEach(target => {
                if (target.status.hp <= 0) return;
                const { damage, critical, dodged } = calculateDamage(attacker, target, d.isMagic, d.power, false, 'single');
                if (dodged) {
                    logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
                } else {
                    if (critical) logMessage(`会心の一撃！`, 'special-event');
                    logMessage(`${attacker.name}の${skill.name}！ ${target.name}に${damage}のダメージ！`, 'damage');
                    target.status.hp = Math.max(0, target.status.hp - damage);
                    if (proc && Math.random() < burnChance) {
                        target.effects.burn = { duration: proc.duration, damage: Math.floor(attacker.status.matk * 0.2) };
                        logMessage(`${target.name}は火傷状態になった！`, 'status-effect');
                    }
                }
            });
        }
    },

    // 必殺技無効化（復活時はコメントを外す）
    // 'ソリッドウォール': (caster, targets, calculateDamage, logMessage) => {
    //     caster.effects.invulnerable = { duration: 1 }; // 1ターン無敵
    //     logMessage(`${caster.name}はソリッドウォールを展開し、全てのダメージを無効化した！`, 'special-event');
    // },
    // 'ガイアシェル': (caster, targets, calculateDamage, logMessage) => {
    //     targets.forEach(target => {
    //         target.effects.defBuff = { duration: 2, value: 1.25 }; // 防御力25%アップ
    //         target.effects.mdefBuff = { duration: 2, value: 1.25 }; // 魔法防御力25%アップ
    //     });
    //     logMessage(`味方全体にガイアシェルの加護がかかった！`, 'status-effect');
    // },
    // 'ハーモニー': (caster, targets, calculateDamage, logMessage) => {
    //     const healAmount = Math.floor(caster.status.support * 1.0); // わずかにHP回復
    //     targets.forEach(target => {
    //         target.status.hp = Math.min(target.status.maxHp, target.status.hp + healAmount);
    //         target.effects = {};
    //     });
    //     logMessage(`味方全体の状態異常が治癒し、HPが回復した！`, 'heal');
    // },
    // 'ライフセーバー': (caster, targets, calculateDamage, logMessage) => {
    //     const target = targets[0];
    //     target.status.hp = target.status.maxHp;
    //     target.effects = {};
    //     logMessage(`${target.name}のHPが完全に回復し、全てのデバフが治癒した！`, 'heal');
    // },
    // 'エターナルマナ': (caster, targets, calculateDamage, logMessage) => {
    //     targets.forEach(target => {
    //         target.status.mp = target.status.maxMp;
    //     });
    //     caster.status.mp = Math.min(caster.status.maxMp, caster.status.mp + Math.floor(caster.status.maxMp * 0.5));
    //     logMessage(`味方全体のMPが完全に回復した！`, 'heal');
    // },
    // 'デスタッチ': (attacker, targets, calculateDamage, logMessage) => {
    //     targets.forEach(target => {
    //         const { damage, critical, dodged } = calculateDamage(attacker, target, true, 1.5);
    //         if (!dodged) {
    //             if (critical) logMessage(`会心の一撃！`, 'special-event');
    //             logMessage(`${attacker.name}の必殺技！ ${target.name}に${damage}のダメージ！`, 'damage');
    //             target.status.hp = Math.max(0, target.status.hp - damage);
    //             target.effects.defDebuff = { duration: 3, value: 0.5 };
    //             target.effects.mdefDebuff = { duration: 3, value: 0.5 };
    //             logMessage(`${target.name}の防御力が大幅に低下した！`, 'status-effect');
    //         } else {
    //             logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
    //         }
    //     });
    // },
    // 'ディメンションスラッシュ': (attacker, targets, calculateDamage, logMessage) => {
    //     const target = targets[0];
    //     const { damage, critical, dodged } = calculateDamage(attacker, target, false, 3.0);
    //     if (dodged) {
    //         logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
    //     } else {
    //         if (critical) logMessage(`会心の一撃！`, 'special-event');
    //         logMessage(`${attacker.name}の必殺技！ ${target.name}に${damage}のダメージ！`, 'damage');
    //         target.status.hp = Math.max(0, target.status.hp - damage);
    //         if (Math.random() < 0.3) {
    //             if (target.status.hp > 0) {
    //                 target.status.hp = 0;
    //                 logMessage(`${target.name}は一撃で仕留められた！`, 'special-event');
    //             }
    //         }
    //     }
    // },
    // 'メテオフォール': (attacker, targets, calculateDamage, logMessage) => {
    //     targets.forEach(target => {
    //         const { damage, critical, dodged } = calculateDamage(attacker, target, true, 2.5);
    //         if (!dodged) {
    //             if (critical) logMessage(`会心の一撃！`, 'special-event');
    //             logMessage(`${attacker.name}の必殺技！ ${target.name}に${damage}のダメージ！`, 'damage');
    //             target.status.hp = Math.max(0, target.status.hp - damage);
    //         } else {
    //             logMessage(`${target.name}は攻撃を回避した！`, 'status-effect');
    //         }
    //     });
    // }
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
        // 孤高の刃: ダメージ補正は削除（会心率変動に変更済み）
        return damage;
    }
};

/**
 * クリティカル率計算時のパッシブ効果
 */
export const criticalPassiveEffects = {
    'char07': (attacker, target, baseRate) => {
        // 孤高の刃: 非会心で会心率が累積、会心でリセット（accumulate/clearはcalculateDamage内）
        const bonus = attacker.effects?.loneBladeCritRate ?? 0;
        return baseRate + bonus;
    }
};