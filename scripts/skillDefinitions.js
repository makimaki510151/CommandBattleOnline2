// skillDefinitions.js
// スキルの数値データを一元管理し、説明文をデータ駆動で生成する

/**
 * スキル名をキーにした数値データ（効果ロジックと説明の両方で使用）
 */
export const skillData = {
    // 鉄壁の騎士ゼイド
    'ランパート': { effect: 'taunt', duration: 1 },
    'シールドバッシュ': {
        effect: 'damage',
        power: 1,
        proc: { chance: 0.4, effect: 'spdDebuff', value: 0.5, duration: 1, descKey: '行動順を遅らせる' }
    },
    'ストロングガード': {
        effect: 'buff',
        buffs: [{ stat: 'def', value: 1.5 }, { stat: 'mdef', value: 1.5 }],
        duration: 3
    },

    // 大地戦士ゴルム
    'プロヴォーク': { effect: 'taunt_all', duration: 2 },
    'アースクエイク': {
        effect: 'damage',
        power: 1,
        proc: { chance: 0.3, effect: 'spdDebuff', value: 0.7, duration: 2, descKey: '素早さを低下させる' }
    },
    '自己再生': { effect: 'heal_self', healRatio: 0.15 },

    // 風の歌い手ミサ
    'ブレイブソング': { effect: 'buff', buffs: [{ stat: 'atk', value: 1.3 }], duration: 3 },
    'マジックコーラス': { effect: 'buff', buffs: [{ stat: 'matk', value: 1.3 }], duration: 3 },
    'スピードアップ': { effect: 'buff', buffs: [{ stat: 'spd', value: 1.6 }], duration: 3 },

    // 慈愛の聖女ルナ
    'ハイヒール': { effect: 'heal', supportMul: 3.0 },
    'エリアヒール': { effect: 'heal', supportMul: 1.8 },
    'リザレクション': { effect: 'revive', reviveRatio: 0.5 },

    // 魔力供給者アルト
    'マナチャージ': { effect: 'mp_heal', supportMul: 2.5 },
    'エナジーフロー': { effect: 'mp_heal', supportMul: 1.5 },
    'マナドレイン': {
        effect: 'damage',
        power: 0.5,
        isMagic: true,
        mpStealRatio: 0.5
    },

    // 呪術師アザミ
    'ウィークネス': {
        effect: 'debuff',
        debuffs: [{ stat: 'atk', value: 0.7 }, { stat: 'matk', value: 0.7 }],
        duration: 3
    },
    'スローカース': {
        effect: 'damage',
        power: 0.8,
        isMagic: true,
        proc: {
            chance: 0.3,
            chanceOwner: 'char06',
            chanceOwnerLabel: '呪術師',
            chanceOwnerValue: 0.45,
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
            chance: 0.5,
            chanceOwner: 'char06',
            chanceOwnerLabel: '呪術師',
            chanceOwnerValue: 0.75,
            effect: 'poison',
            duration: 3,
            descKey: '毒状態にする'
        }
    },

    // 一撃の剣士カイ
    'ブレイクスルー': { effect: 'damage', power: 1.5, ignoreDefense: true },
    'ラピッドストライク': { effect: 'damage_hits', power: 0.8, hits: 2 },
    'チャージアップ': { effect: 'buff', buffs: [{ stat: 'atk', value: 1.5 }], duration: 2 },

    // 業火の魔女イヴ
    'ファイアストーム': {
        effect: 'damage',
        power: 1,
        isMagic: true,
        proc: {
            chance: 0.2,
            chanceOwner: 'char08',
            chanceOwnerLabel: '魔女',
            chanceOwnerValue: 0.35,
            effect: 'burn',
            duration: 3,
            descKey: '火傷にする'
        }
    },
    'ヒートウェーブ': {
        effect: 'damage',
        power: 0.9,
        isMagic: true,
        proc: {
            chance: 0.3,
            effect: 'defDebuff',
            value: 0.7,
            duration: 2,
            descKey: '防御力を低下させる'
        }
    },
    'バーニングアロー': {
        effect: 'damage',
        power: 1,
        isMagic: true,
        proc: { chance: 1, effect: 'burn', duration: 3, descKey: '火傷にする' }
    }
};

const STAT_NAMES = { atk: '物理攻撃力', matk: '魔法攻撃力', def: '防御力', mdef: '魔法防御力', spd: '素早さ' };
const EFFECT_NAMES = { spdDebuff: '素早さ低下', defDebuff: '防御力低下', poison: '毒', burn: '火傷' };

/**
 * スキルデータから説明文を生成する
 */
export function generateSkillDesc(skill) {
    const d = skillData[skill.name];
    if (!d) return skill.desc || '説明なし';

    switch (d.effect) {
        case 'taunt':
            return `味方単体への次の敵の単体攻撃を、自身に引き付ける（${d.duration}ターン）。`;
        case 'taunt_all':
            return `敵全体を挑発し、${d.duration}ターンの間、敵の攻撃を自身に引き付ける。`;
        case 'damage':
        case 'damage_hits': {
            const hits = d.hits ? `${d.hits}回` : '';
            const pow = d.power !== 1 ? `${d.power}倍` : '';
            const magic = d.isMagic ? '魔' : '物理';
            const scope = skill.target === 'all_enemies' ? '敵全体' : '敵単体';
            let s = `${scope}に${magic}攻撃${hits}${pow ? '（' + pow + '）' : ''}`;
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
            const stats = d.buffs.map(b => `${STAT_NAMES[b.stat] || b.stat}を${b.value}倍`).join('・');
            const scope = (skill.target === 'all_allies' || skill.target === 'self') ? (skill.target === 'self' ? '自身' : '味方全体') : '味方単体';
            return `${scope}の${stats}（${d.duration}ターン）。`;
        }
        case 'debuff': {
            const stats = d.debuffs.map(b => `${STAT_NAMES[b.stat] || b.stat}を${((1 - b.value) * 100) | 0}%低下`).join('・');
            return `敵単体の${stats}（${d.duration}ターン）。`;
        }
        case 'heal':
            return `味方${skill.target === 'all_allies' ? '全体' : '単体'}のHPを支援力×${d.supportMul}で回復する。`;
        case 'heal_self':
            return `自身のHPを最大HPの${(d.healRatio * 100) | 0}%回復する。`;
        case 'revive':
            return `戦闘不能の味方単体を最大HPの${(d.reviveRatio * 100) | 0}%で復活させる。`;
        case 'mp_heal':
            return `味方${skill.target === 'all_allies' ? '全体' : '単体'}のMPを支援力×${d.supportMul}で回復する。`;
        default:
            return skill.desc || '';
    }
}
