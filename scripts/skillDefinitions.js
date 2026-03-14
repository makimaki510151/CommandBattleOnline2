// skillDefinitions.js
// スキルの数値データを一元管理し、説明文をデータ駆動で生成する

/**
 * スキル名をキーにした数値データ（効果ロジックと説明の両方で使用）
 */
export const skillData = {
    // 鉄壁の騎士ゼイド
    'ランパート': { effect: 'taunt', duration: 2, damageReduction: 0.15 },
    'シールドバッシュ': {
        effect: 'damage',
        powerRef: 'def',
        power: 1,
        proc: { chance: 0.4, effect: 'orderDelay', value: 0.5, duration: 1, descKey: '行動順を遅らせる' }
    },
    'ストロングガード': {
        effect: 'buff',
        buffs: [{ stat: 'def', value: 1.4 }, { stat: 'mdef', value: 1.4 }],
        duration: 3
    },

    // 大地戦士ゴルム
    'プロヴォーク': { effect: 'taunt_all', duration: 2, maxRedirects: 3 },
    'アースクエイク': {
        effect: 'damage',
        power: 1,
        proc: { chance: 0.3, effect: 'spdDebuff', value: 0.7, duration: 2, descKey: '素早さを低下させる' }
    },
    '自己再生': { effect: 'heal_self', healRatio: 0.09 },

    // 風の歌い手ミサ
    'バトルソング': { effect: 'buff', buffs: [{ stat: 'atk', value: 1.25 }, { stat: 'matk', value: 1.25 }], duration: 3 },
    'ミストステップ': { effect: 'buff', buffs: [{ stat: 'dodge', value: 1.5 }], duration: 3 },
    'スピードアップ': { effect: 'buff', buffs: [{ stat: 'spd', value: 1.45 }], duration: 3 },

    // 慈愛の聖女ルナ
    'ハイヒール': { effect: 'heal', supportMul: 1.7 },
    'エリアヒール': { effect: 'heal', supportMul: 1.1 },
    'リザレクション': { effect: 'revive', reviveRatio: 0.35 },

    // 魔力供給者アルト
    'マナチャージ': { effect: 'mp_heal', supportMul: 1.7 },
    'エナジーフロー': { effect: 'mp_heal', supportMul: 1.1 },
    'マナドレイン': {
        effect: 'damage',
        power: 1.5,
        isMagic: true,
        mpStealRatio: 1
    },

    // 呪術師アザミ
    'ウィークネス': {
        effect: 'debuff',
        debuffs: [{ stat: 'def', value: 0.7 }, { stat: 'mdef', value: 0.7 }],
        duration: 3
    },
    'スローカース': {
        effect: 'damage',
        power: 0.8,
        isMagic: true,
        proc: {
            chance: 1,
            effect: 'spdDebuff',
            value: 0.6,
            duration: 3,
            descKey: '素早さを低下させる'
        }
    },
    'ヴェノムボム': {
        effect: 'damage',
        power: 1,
        isMagic: true,
        proc: {
            chance: 1,
            effect: 'poison',
            duration: 3,
            descKey: '毒状態にする'
        }
    },

    // 一撃の剣士カイ
    'ブレイクスルー': { effect: 'damage', power: 1.0, ignoreDefense: true },
    'ラピッドストライク': { effect: 'damage_hits', power: 0.72, hits: 3 },
    'チャージアップ': {
        effect: 'buff',
        buffs: [{ stat: 'atk', value: 1.1 }, { stat: 'critRate', value: 0.15 }],
        duration: 2
    },

    // 業火の魔女イヴ
    'ファイアストーム': {
        effect: 'damage_random_hits',
        power: 0.88,
        hits: 6,
        isMagic: true
    },
    'バーンバーン': {
        effect: 'burn_consume_damage',
        power: 2.5,
        isMagic: true
    },
    'バーニングアロー': {
        effect: 'damage_all_hits',
        power: 0.5,
        hits: 3,
        isMagic: true,
        proc: { chance: 0.2, effect: 'burn', duration: 3, descKey: '火傷にする' }
    }
};

const STAT_NAMES = { atk: '物理攻撃力', matk: '魔法攻撃力', def: '防御力', mdef: '魔法防御力', spd: '素早さ', critRate: '会心率', dodge: '回避率' };
const EFFECT_NAMES = { spdDebuff: '素早さ低下', orderDelay: '行動順を遅らせる', defDebuff: '防御力低下', poison: '毒', burn: '火傷' };

/**
 * スキルデータから説明文を生成する
 */
export function generateSkillDesc(skill) {
    const d = skillData[skill.name];
    if (!d) return skill.desc || '説明なし';

    switch (d.effect) {
        case 'taunt':
            return `味方単体への敵の単体攻撃を、自身に引き付け、その間ダメージを${(d.damageReduction || 0) * 100}%軽減する（${d.duration}ターン）。`;
        case 'taunt_all': {
            const limit = d.maxRedirects != null ? `、単体攻撃${d.maxRedirects}回` : '';
            return `敵全体を挑発し、${d.duration}ターン${limit}の間、敵の攻撃を自身に引き付ける。`;
        }
        case 'burn_consume_damage':
            return '敵全体に対し、やけどデバフを受けている敵はやけどが消え、代わりに魔法ダメージを受ける。';
        case 'damage_all_hits': {
            const hits = d.hits ?? 3;
            const procStr = d.proc ? ` 各ヒット${(d.proc.chance * 100) | 0}%で${d.proc.descKey || '火傷'}（${d.proc.duration}T）` : '';
            return `敵全体に${hits}回魔法攻撃（${d.power}倍）。${procStr}`;
        }
        case 'damage_random_hits': {
            const hits = d.hits ?? 6;
            return `敵に${hits}回の魔法ダメージ。それぞれの対象は敵全体からランダムに抽選。`;
        }
        case 'damage':
        case 'damage_hits': {
            const hits = d.hits ? `${d.hits}回` : '';
            const pow = d.power !== 1 ? `${d.power}倍` : '';
            const powRef = d.powerRef === 'def' ? '物理防御力参照' : '';
            const magic = d.isMagic ? '魔' : '物理';
            const scope = skill.target === 'all_enemies' ? '敵全体' : '敵単体';
            const powPart = (pow || powRef) ? `（${[pow, powRef].filter(Boolean).join('・')}）` : '';
            let s = `${scope}に${magic}攻撃${hits}${powPart}`;
            if (d.ignoreDefense) s += '（防御無視）';
            if (d.mpStealRatio) s += `。与ダメの${d.mpStealRatio * 100}%をMP回復`;
            if (d.proc) {
                const p = d.proc;
                const eff = p.descKey || EFFECT_NAMES[p.effect] || '';
                const chanceStr = p.chanceOwner
                    ? `${p.chanceOwnerLabel || '特定キャラ'}${(p.chanceOwnerValue * 100) | 0}%／他${(p.chance * 100) | 0}%で${eff}`
                    : p.chance === 1 ? `必ず${eff}` : `${(p.chance * 100) | 0}%で${eff}`;
                s += `。${chanceStr}（${p.duration}ターン）`;
            }
            return s + '。';
        }
        case 'buff': {
            const stats = d.buffs.map(b => {
                if (b.stat === 'critRate') return `${STAT_NAMES[b.stat] || b.stat}を+${(b.value * 100) | 0}%`;
                return `${STAT_NAMES[b.stat] || b.stat}を${b.value}倍`;
            }).join('・');
            const scope = (skill.target === 'all_allies' || skill.target === 'self') ? (skill.target === 'self' ? '自身' : '味方全体') : '味方単体';
            return `${scope}の${stats}（${d.duration}ターン）。`;
        }
        case 'debuff': {
            const stats = d.debuffs.map(b => `${STAT_NAMES[b.stat] || b.stat}を${((1 - b.value) * 100) | 0}%低下`).join('・');
            return `敵単体の${stats}（${d.duration}ターン）。`;
        }
        case 'heal':
            return `自身以外の味方${skill.target === 'all_allies_exclude_self' ? '全体' : '単体'}のHPを支援力×${d.supportMul}で回復する。`;
        case 'heal_self':
            return `自身のHPを最大HPの${(d.healRatio * 100) | 0}%回復する。`;
        case 'revive':
            return `戦闘不能の味方単体を最大HPの${(d.reviveRatio * 100) | 0}%で復活させる。`;
        case 'mp_heal':
            return `自身以外の味方${skill.target === 'all_allies_exclude_self' ? '全体' : '単体'}のMPを支援力×${d.supportMul}で回復する。`;
        default:
            return skill.desc || '';
    }
}
