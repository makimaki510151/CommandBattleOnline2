export const characters = [
    // 1. 仲間一人を強固に守るタンク
    {
        id: 'new_char01', name: '鉄壁の騎士ゼイド', role: '単体守護者', image: 'images/new_char01.png',
        attackType: 'physical',
        status: {
            maxHp: 320, hp: 320,
            maxMp: 60, mp: 60,
            atk: 40, matk: 10,
            def: 70, mdef: 30,
            spd: 15,
            support: 10,
            criticalRate: 0.05, dodgeRate: 0.05, criticalMultiplier: 1.5
        },
        passive: {
            name: '絶対の守護',
            desc: '自身が受ける単体攻撃のダメージを15%軽減する。',
            flavor: '（彼の盾は、一つの刃を決して通さない。）'
        },
        active: [
            { name: 'ランパート', mp: 15, desc: '味方単体への次の敵の単体攻撃を、自身に引き付ける。', flavor: '（仲間を護るため、彼は一歩前に出る。）', target: 'ally_single' },
            { name: 'シールドバッシュ', mp: 10, desc: '敵単体に物理攻撃を行い、確率で行動順を遅らせる。', flavor: '（盾で敵を強打し、その動きを乱す。）', target: 'single' },
            { name: 'ストロングガード', mp: 20, desc: '自身の物理・魔法防御力を上昇させる。', flavor: '（全身の装甲を固定し、守りを固める。）', target: 'self' }
        ],
        special: {
            name: 'ソリッドウォール', mp: 50, desc: '自身への全てのダメージを1ターン無効化する。', flavor: '（一瞬、鋼鉄の壁と化す。）', target: 'self'
        }
    },
    // 2. 仲間全体を守り盾になるタンク
    {
        id: 'new_char02', name: '大地戦士ゴルム', role: '全体守護者', image: 'images/new_char02.png',
        attackType: 'physical',
        status: {
            maxHp: 350, hp: 350,
            maxMp: 50, mp: 50,
            atk: 35, matk: 10,
            def: 65, mdef: 40,
            spd: 10,
            support: 5,
            criticalRate: 0.05, dodgeRate: 0.02, criticalMultiplier: 1.3
        },
        passive: {
            name: '広域カバー',
            desc: '自身以外の味方全体が受ける全体攻撃のダメージを15%軽減する。',
            flavor: '（大地のような広さで仲間を守る。）'
        },
        active: [
            { name: 'プロヴォーク', mp: 15, desc: '敵全体を挑発し、2ターンの間、自身への攻撃を引き付ける。', flavor: '（雄叫びを上げ、敵の注意を一身に集める。）', target: 'all_enemies' },
            { name: 'アースクエイク', mp: 20, desc: '敵全体に物理攻撃を行い、確率で素早さを低下させる。', flavor: '（地面を叩きつけ、衝撃波を発生させる。）', target: 'all_enemies' },
            { name: '自己再生', mp: 10, desc: '自身のHPをわずかに回復する。', flavor: '（大地の力で、傷ついた体を癒す。）', target: 'self' }
        ],
        special: {
            name: 'ガイアシェル', mp: 40, desc: '味方全体に物理・魔法ダメージ軽減バフを付与する。', flavor: '（大地の硬い甲羅が仲間を包む。）', target: 'all_allies'
        }
    },
    // 3. 様々な支援を行うサポーター
    {
        id: 'new_char03', name: '風の歌い手ミサ', role: '万能支援', image: 'images/new_char03.png',
        attackType: 'magic',
        status: {
            maxHp: 180, hp: 180,
            maxMp: 150, mp: 150,
            atk: 10, matk: 30,
            def: 20, mdef: 40,
            spd: 50,
            support: 65,
            criticalRate: 0.05, dodgeRate: 0.15, criticalMultiplier: 1.5
        },
        passive: {
            name: '調和の旋律',
            desc: '毎ターン開始時、ランダムな味方単体の攻撃力か魔法攻撃力を上昇させる。',
            flavor: '（彼女の歌声は、戦う者の力を引き出す。）'
        },
        active: [
            { name: 'ブレイブソング', mp: 25, desc: '味方全体に物理攻撃力上昇バフを付与する。', flavor: '（勇気を鼓舞する歌で、戦士の力を高める。）', target: 'all_allies' },
            { name: 'マジックコーラス', mp: 25, desc: '味方全体に魔法攻撃力上昇バフを付与する。', flavor: '（魔力を増幅させる合唱で、魔導士の力を高める。）', target: 'all_allies' },
            { name: 'スピードアップ', mp: 15, desc: '味方単体の素早さを大幅に上昇させる。', flavor: '（風の精霊が、仲間の足取りを軽くする。）', target: 'ally_single' }
        ],
        special: {
            name: 'ハーモニー', mp: 60, desc: '味方全体の状態異常を全て治癒し、HPをわずかに回復する。', flavor: '（全てを洗い流す清らかな調べ。）', target: 'all_allies'
        }
    },
    // 4. 体力回復特化の回復職
    {
        id: 'new_char04', name: '慈愛の聖女ルナ', role: 'HPヒーラー', image: 'images/new_char04.png',
        attackType: 'magic',
        status: {
            maxHp: 200, hp: 200,
            maxMp: 160, mp: 160,
            atk: 5, matk: 25,
            def: 30, mdef: 60,
            spd: 25,
            support: 80,
            criticalRate: 0.05, dodgeRate: 0.1, criticalMultiplier: 1.5
        },
        passive: {
            name: '祈りの光',
            desc: '回復魔法の効果が10%上昇する。',
            flavor: '（彼女の祈りは、奇跡を起こす。）'
        },
        active: [
            { name: 'ハイヒール', mp: 20, desc: '味方単体のHPを大きく回復する。', flavor: '（聖なる光が傷を瞬時に癒す。）', target: 'ally_single' },
            { name: 'エリアヒール', mp: 35, desc: '味方全体のHPを回復する。', flavor: '（広範囲に優しい癒やしの光を放つ。）', target: 'all_allies' },
            { name: 'リザレクション', mp: 50, desc: '戦闘不能の味方単体をHPを半分にして復活させる。', flavor: '（一度失われた命を呼び戻す奇跡。）', target: 'ally_single_dead' }
        ],
        special: {
            name: 'ライフセーバー', mp: 80, desc: '味方単体のHPを最大値まで完全に回復し、全てのデバフを治癒する。', flavor: '（生命の源泉が湧き出る。）', target: 'ally_single'
        }
    },
    // 5. MP回復特化の回復職
    {
        id: 'new_char05', name: '魔力供給者アルト', role: 'MPバッテリー', image: 'images/new_char05.png',
        attackType: 'magic',
        status: {
            maxHp: 170, hp: 170,
            maxMp: 220, mp: 220,
            atk: 5, matk: 35,
            def: 25, mdef: 50,
            spd: 35,
            support: 70,
            criticalRate: 0.05, dodgeRate: 0.1, criticalMultiplier: 1.5
        },
        passive: {
            name: '魔力の泉',
            desc: '自身のMP回復量が15%上昇する。',
            flavor: '（彼の魔力は尽きることがない。）'
        },
        active: [
            { name: 'マナチャージ', mp: 10, desc: '味方単体のMPを大きく回復する。', flavor: '（純粋な魔力を直接注入する。）', target: 'ally_single' },
            { name: 'エナジーフロー', mp: 40, desc: '味方全体のMPを回復する。', flavor: '（パーティ全体に魔力の流れを作り出す。）', target: 'all_allies' },
            { name: 'マナドレイン', mp: 0, desc: '敵単体にわずかな魔法ダメージを与え、与えたダメージの半分のMPを回復する。', flavor: '（敵の魔力を吸収し、自身の力に変える。）', target: 'single' }
        ],
        special: {
            name: 'エターナルマナ', mp: 60, desc: '味方全体のMPを最大値まで完全に回復し、自身のMPも回復する。', flavor: '（無限の魔力の扉を開く。）', target: 'all_allies'
        }
    },
    // 6. 様々なデバフをばら撒くサポーター
    {
        id: 'new_char06', name: '呪術師アザミ', role: 'デバフ専門', image: 'images/new_char06.png',
        attackType: 'magic',
        status: {
            maxHp: 160, hp: 160,
            maxMp: 170, mp: 170,
            atk: 10, matk: 50,
            def: 15, mdef: 45,
            spd: 45,
            support: 50,
            criticalRate: 0.1, dodgeRate: 0.2, criticalMultiplier: 1.8
        },
        passive: {
            name: '怨嗟の波動',
            desc: '自身のデバフ効果の付与確率が上昇する。',
            flavor: '（彼女の放つ呪いは、必ず敵の心身を蝕む。）'
        },
        active: [
            { name: 'ウィークネス', mp: 20, desc: '敵単体の物理・魔法攻撃力を低下させる。', flavor: '（呪いの力で、敵の力を奪う。）', target: 'single' },
            { name: 'スローカース', mp: 25, desc: '敵全体に魔法攻撃を行い、確率で素早さを低下させる。', flavor: '（足枷となる重い呪いを敵全体にかける。）', target: 'all_enemies' },
            { name: 'ヴェノムボム', mp: 15, desc: '敵単体に魔法攻撃を行い、高確率で毒状態にする。', flavor: '（強力な毒を仕込んだ爆弾を投擲する。）', target: 'single' }
        ],
        special: {
            name: 'デスタッチ', mp: 70, desc: '敵全体に強力な呪いをかけ、防御力と魔法防御力を大幅に低下させる。', flavor: '（死を予感させる、抗えない呪い。）', target: 'all_enemies'
        }
    },
    // 7. 単体特化のアタッカー
    {
        id: 'new_char07', name: '一撃の剣士カイ', role: '単体特化攻撃', image: 'images/new_char07.png',
        attackType: 'physical',
        status: {
            maxHp: 220, hp: 220,
            maxMp: 70, mp: 70,
            atk: 80, matk: 5,
            def: 30, mdef: 15,
            spd: 55,
            support: 10,
            criticalRate: 0.35, dodgeRate: 0.1, criticalMultiplier: 2.0
        },
        passive: {
            name: '孤高の刃',
            desc: '敵単体への攻撃時、ダメージが15%上昇する。',
            flavor: '（狙った獲物は逃さない、孤高の剣。）'
        },
        active: [
            { name: 'ブレイクスルー', mp: 30, desc: '敵単体に超大な物理攻撃を行い、防御力無視効果がある。', flavor: '（敵の防御を貫く、渾身の一撃。）', target: 'single' },
            { name: 'ラピッドストライク', mp: 15, desc: '敵単体に素早い物理攻撃を2回行う。', flavor: '（瞬時のうちに二連撃を叩き込む。）', target: 'single' },
            { name: 'チャージアップ', mp: 10, desc: '自身の物理攻撃力を一時的に上昇させる。', flavor: '（力を溜め、次の一撃に全てを懸ける。）', target: 'self' }
        ],
        special: {
            name: 'ディメンションスラッシュ', mp: 60, desc: '敵単体に超大な物理ダメージを与え、高確率で即死させる。', flavor: '（次元をも切り裂く、究極の一閃。）', target: 'single'
        }
    },
    // 8. 全体的にじわじわ削っていくアタッカー
    {
        id: 'new_char08', name: '業火の魔女イヴ', role: '全体削り', image: 'images/new_char08.png',
        attackType: 'magic',
        status: {
            maxHp: 190, hp: 190,
            maxMp: 190, mp: 190,
            atk: 5, matk: 65,
            def: 25, mdef: 35,
            spd: 40,
            support: 15,
            criticalRate: 0.1, dodgeRate: 0.1, criticalMultiplier: 1.7
        },
        passive: {
            name: '炎の残滓',
            desc: '全体魔法攻撃時、確率で敵全体を火傷状態にする。',
            flavor: '（彼女の魔法が通った後には、燃え尽きた灰しか残らない。）'
        },
        active: [
            { name: 'ファイアストーム', mp: 35, desc: '敵全体に強力な魔法攻撃を行う。', flavor: '（炎の嵐を呼び寄せ、全てを焼き払う。）', target: 'all_enemies' },
            { name: 'ヒートウェーブ', mp: 20, desc: '敵全体に魔法攻撃を行い、確率で防御力を低下させる。', flavor: '（超高熱の波動で、敵の装甲を脆くする。）', target: 'all_enemies' },
            { name: 'バーニングアロー', mp: 10, desc: '敵単体に魔法攻撃を行い、数ターンの間、火傷ダメージを与える。', flavor: '（炎を纏った矢を放ち、敵の体を内側から燃やす。）', target: 'single' }
        ],
        special: {
            name: 'メテオフォール', mp: 75, desc: '空から巨大な隕石を落とし、敵全体に超大な魔法ダメージを与える。', flavor: '（星の破片が大地に降り注ぎ、全てを破壊する。）', target: 'all_enemies'
        }
    }
];