import { generateSkillDesc } from './skillDefinitions.js';

function sk(name, mp, target, flavor) {
    const s = { name, mp, target, flavor };
    s.desc = generateSkillDesc(s);
    return s;
}

export const characters = [
    // 1. 仲間一人を強固に守るタンク
    {
        id: 'char01', name: '鉄壁の騎士ゼイド', role: '単体守護者', image: 'images/char01.png',
        attackType: 'physical',
        status: {
            maxHp: 380, hp: 380,
            maxMp: 65, mp: 65,
            atk: 38, matk: 8,
            def: 72, mdef: 32,
            spd: 14,
            support: 10,
            criticalRate: 0.05, dodgeRate: 0.05, criticalMultiplier: 1.5
        },
        passive: {
            name: '絶対の守護',
            desc: '自身が受ける単体攻撃のダメージを15%軽減する。',
            flavor: '（彼の盾は、一つの刃を決して通さない。）'
        },
        active: [
            sk('ランパート', 15, 'ally_single', '（仲間を護るため、彼は一歩前に出る。）'),
            sk('シールドバッシュ', 10, 'single', '（盾で敵を強打し、その動きを乱す。）'),
            sk('ストロングガード', 20, 'self', '（全身の装甲を固定し、守りを固める。）')
        ],
        // 必殺技無効化（復活時はコメントを外す）
        // special: {
        //     name: 'ソリッドウォール', mp: 50, desc: '自身への全てのダメージを1ターン無効化する。', flavor: '（一瞬、鋼鉄の壁と化す。）', target: 'self'
        // }
    },
    // 2. 仲間全体を守り盾になるタンク
    {
        id: 'char02', name: '大地戦士ゴルム', role: '全体守護者', image: 'images/char02.png',
        attackType: 'physical',
        status: {
            maxHp: 400, hp: 400,
            maxMp: 55, mp: 55,
            atk: 34, matk: 8,
            def: 68, mdef: 42,
            spd: 11,
            support: 5,
            criticalRate: 0.05, dodgeRate: 0.02, criticalMultiplier: 1.3
        },
        passive: {
            name: '広域カバー',
            desc: '自身以外の味方全体が受ける全体攻撃のダメージを15%軽減する。',
            flavor: '（大地のような広さで仲間を守る。）'
        },
        active: [
            sk('プロヴォーク', 15, 'all_enemies', '（雄叫びを上げ、敵の注意を一身に集める。）'),
            sk('アースクエイク', 20, 'all_enemies', '（地面を叩きつけ、衝撃波を発生させる。）'),
            sk('自己再生', 10, 'self', '（大地の力で、傷ついた体を癒す。）')
        ],
        // 必殺技無効化（復活時はコメントを外す）
        // special: {
        //     name: 'ガイアシェル', mp: 40, desc: '味方全体に物理・魔法ダメージ軽減バフを付与する。', flavor: '（大地の硬い甲羅が仲間を包む。）', target: 'all_allies'
        // }
    },
    // 3. 様々な支援を行うサポーター
    {
        id: 'char03', name: '風の歌い手ミサ', role: '万能支援', image: 'images/char03.png',
        attackType: 'magic',
        status: {
            maxHp: 200, hp: 200,
            maxMp: 140, mp: 140,
            atk: 12, matk: 28,
            def: 22, mdef: 42,
            spd: 48,
            support: 62,
            criticalRate: 0.05, dodgeRate: 0.15, criticalMultiplier: 1.5
        },
        passive: {
            name: '調和の旋律',
            desc: '毎ターン開始時、ランダムな味方単体の攻撃力か魔法攻撃力を上昇させる。',
            flavor: '（彼女の歌声は、戦う者の力を引き出す。）'
        },
        active: [
            sk('ブレイブソング', 25, 'all_allies', '（勇気を鼓舞する歌で、戦士の力を高める。）'),
            sk('マジックコーラス', 25, 'all_allies', '（魔力を増幅させる合唱で、魔導士の力を高める。）'),
            sk('スピードアップ', 15, 'ally_single', '（風の精霊が、仲間の足取りを軽くする。）')
        ],
        // 必殺技無効化（復活時はコメントを外す）
        // special: {
        //     name: 'ハーモニー', mp: 60, desc: '味方全体の状態異常を全て治癒し、HPをわずかに回復する。', flavor: '（全てを洗い流す清らかな調べ。）', target: 'all_allies'
        // }
    },
    // 4. 体力回復特化の回復職
    {
        id: 'char04', name: '慈愛の聖女ルナ', role: 'HPヒーラー', image: 'images/char04.png',
        attackType: 'magic',
        status: {
            maxHp: 220, hp: 220,
            maxMp: 150, mp: 150,
            atk: 5, matk: 22,
            def: 32, mdef: 58,
            spd: 28,
            support: 72,
            criticalRate: 0.05, dodgeRate: 0.1, criticalMultiplier: 1.5
        },
        passive: {
            name: '祈りの光',
            desc: '回復魔法の効果が10%上昇する。',
            flavor: '（彼女の祈りは、奇跡を起こす。）'
        },
        active: [
            sk('ハイヒール', 20, 'ally_single', '（聖なる光が傷を瞬時に癒す。）'),
            sk('エリアヒール', 35, 'all_allies', '（広範囲に優しい癒やしの光を放つ。）'),
            sk('リザレクション', 50, 'ally_single_dead', '（一度失われた命を呼び戻す奇跡。）')
        ],
        // 必殺技無効化（復活時はコメントを外す）
        // special: {
        //     name: 'ライフセーバー', mp: 80, desc: '味方単体のHPを最大値まで完全に回復し、全てのデバフを治癒する。', flavor: '（生命の源泉が湧き出る。）', target: 'ally_single'
        // }
    },
    // 5. MP回復特化の回復職
    {
        id: 'char05', name: '魔力供給者アルト', role: 'MPバッテリー', image: 'images/char05.png',
        attackType: 'magic',
        status: {
            maxHp: 185, hp: 185,
            maxMp: 200, mp: 200,
            atk: 5, matk: 32,
            def: 26, mdef: 48,
            spd: 36,
            support: 68,
            criticalRate: 0.05, dodgeRate: 0.1, criticalMultiplier: 1.5
        },
        passive: {
            name: '魔力の泉',
            desc: '自身のMP回復量が15%上昇する。',
            flavor: '（彼の魔力は尽きることがない。）'
        },
        active: [
            sk('マナチャージ', 10, 'ally_single', '（純粋な魔力を直接注入する。）'),
            sk('エナジーフロー', 40, 'all_allies', '（パーティ全体に魔力の流れを作り出す。）'),
            sk('マナドレイン', 0, 'single', '（敵の魔力を吸収し、自身の力に変える。）')
        ],
        // 必殺技無効化（復活時はコメントを外す）
        // special: {
        //     name: 'エターナルマナ', mp: 60, desc: '味方全体のMPを最大値まで完全に回復し、自身のMPも回復する。', flavor: '（無限の魔力の扉を開く。）', target: 'all_allies'
        // }
    },
    // 6. 様々なデバフをばら撒くサポーター
    {
        id: 'char06', name: '呪術師アザミ', role: 'デバフ専門', image: 'images/char06.png',
        attackType: 'magic',
        status: {
            maxHp: 175, hp: 175,
            maxMp: 165, mp: 165,
            atk: 10, matk: 44,
            def: 18, mdef: 44,
            spd: 44,
            support: 48,
            criticalRate: 0.1, dodgeRate: 0.18, criticalMultiplier: 1.7
        },
        passive: {
            name: '怨嗟の波動',
            desc: '自身のデバフ効果の付与確率が上昇する。',
            flavor: '（彼女の放つ呪いは、必ず敵の心身を蝕む。）'
        },
        active: [
            sk('ウィークネス', 20, 'single', '（呪いの力で、敵の力を奪う。）'),
            sk('スローカース', 25, 'all_enemies', '（足枷となる重い呪いを敵全体にかける。）'),
            sk('ヴェノムボム', 15, 'single', '（強力な毒を仕込んだ爆弾を投擲する。）')
        ],
        // 必殺技無効化（復活時はコメントを外す）
        // special: {
        //     name: 'デスタッチ', mp: 70, desc: '敵全体に強力な呪いをかけ、防御力と魔法防御力を大幅に低下させる。', flavor: '（死を予感させる、抗えない呪い。）', target: 'all_enemies'
        // }
    },
    // 7. 単体特化のアタッカー
    {
        id: 'char07', name: '一撃の剣士カイ', role: '単体特化攻撃', image: 'images/char07.png',
        attackType: 'physical',
        status: {
            maxHp: 230, hp: 230,
            maxMp: 65, mp: 65,
            atk: 58, matk: 5,
            def: 28, mdef: 14,
            spd: 52,
            support: 10,
            criticalRate: 0.18, dodgeRate: 0.1, criticalMultiplier: 1.8
        },
        passive: {
            name: '孤高の刃',
            desc: '敵単体への攻撃時、ダメージが15%上昇する。',
            flavor: '（狙った獲物は逃さない、孤高の剣。）'
        },
        active: [
            sk('ブレイクスルー', 30, 'single', '（敵の防御を貫く、渾身の一撃。）'),
            sk('ラピッドストライク', 15, 'single', '（瞬時のうちに二連撃を叩き込む。）'),
            sk('チャージアップ', 10, 'self', '（力を溜め、次の一撃に全てを懸ける。）')
        ],
        // 必殺技無効化（復活時はコメントを外す）
        // special: {
        //     name: 'ディメンションスラッシュ', mp: 60, desc: '敵単体に超大な物理ダメージを与え、高確率で即死させる。', flavor: '（次元をも切り裂く、究極の一閃。）', target: 'single'
        // }
    },
    // 8. 全体的にじわじわ削っていくアタッカー
    {
        id: 'char08', name: '業火の魔女イヴ', role: '全体削り', image: 'images/char08.png',
        attackType: 'magic',
        status: {
            maxHp: 195, hp: 195,
            maxMp: 170, mp: 170,
            atk: 5, matk: 50,
            def: 24, mdef: 34,
            spd: 38,
            support: 14,
            criticalRate: 0.1, dodgeRate: 0.1, criticalMultiplier: 1.6
        },
        passive: {
            name: '炎の残滓',
            desc: '全体魔法攻撃時、確率で敵全体を火傷状態にする。',
            flavor: '（彼女の魔法が通った後には、燃え尽きた灰しか残らない。）'
        },
        active: [
            sk('ファイアストーム', 35, 'all_enemies', '（炎の嵐を呼び寄せ、全てを焼き払う。）'),
            sk('ヒートウェーブ', 20, 'all_enemies', '（超高熱の波動で、敵の装甲を脆くする。）'),
            sk('バーニングアロー', 10, 'single', '（炎を纏った矢を放ち、敵の体を内側から燃やす。）')
        ],
        // 必殺技無効化（復活時はコメントを外す）
        // special: {
        //     name: 'メテオフォール', mp: 75, desc: '空から巨大な隕石を落とし、敵全体に超大な魔法ダメージを与える。', flavor: '（星の破片が大地に降り注ぎ、全てを破壊する。）', target: 'all_enemies'
        // }
    }
];