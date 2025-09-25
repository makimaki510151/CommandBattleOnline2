export const characters = [
    {
        id: 'char01', name: '聖騎士リアム', role: '聖なる盾', image: 'images/char01.png',
        attackType: 'physical',
        status: {
            maxHp: 300, hp: 300,
            maxMp: 70, mp: 70,
            atk: 45, matk: 15,
            def: 60, mdef: 35,
            spd: 20,
            support: 30,
            criticalRate: 0.1, dodgeRate: 0.05, criticalMultiplier: 1.5
        },
        passive: {
            name: '不屈の守護',
            desc: '自身以外の味方全体が受ける物理ダメージを10%軽減する。',
            flavor: '（仲間を護るため、彼は常に最前線に立つ。その揺るぎない意志が、聖なる光となって仲間を包み込む。）'
        },
        active: [
            { name: 'ヘブンリーストライク', mp: 25, desc: '敵単体に物理攻撃を行い、自身の防御力を上昇させる。', flavor: '（天の加護を受けた一撃は、敵を打ち砕き、自身の守りをより堅固にする。）', target: 'single' },
            { name: 'ガーディアンスマイト', mp: 15, desc: '敵単体に物理攻撃を行い、確率でスタンさせる。', flavor: '（盾に聖なる力を込め、敵に叩きつける。その衝撃は敵の動きを完全に止め、無防備な状態にする。）', target: 'single' },
            { name: 'プロテクション', mp: 20, desc: '味方単体の物理・魔法防御力を上昇させる。', flavor: '（聖なる祈りによって、仲間を護る結界を張る。どんな攻撃も、その結界の前では意味をなさない。）', target: 'ally_single' }
        ],
        special: {
            name: 'ホーリーランス', mp: 60, desc: '巨大な光の槍を召喚し、敵全体に強力な物理ダメージを与える。', flavor: '（天より降り注ぐ光の槍は、邪悪な者を完全に浄化する。その一撃は、戦場全てを光で包み込む。）', target: 'all_enemies'
        }
    },
    {
        id: 'char02', name: '幻術師シエル', role: '夢幻の使い手', image: 'images/char02.png',
        attackType: 'magic',
        status: {
            maxHp: 160, hp: 160,
            maxMp: 180, mp: 180,
            atk: 10, matk: 70,
            def: 15, mdef: 50,
            spd: 40,
            support: 40,
            criticalRate: 0.1, dodgeRate: 0.25, criticalMultiplier: 1.8
        },
        passive: {
            name: '幻惑の霧',
            desc: '戦闘開始時、敵全体の命中率を少し低下させる。',
            flavor: '（彼女の周りには常に淡い霧が立ち込めている。その霧は見る者の目を欺き、現実と幻の区別を曖昧にする。）'
        },
        active: [
            { name: 'ミラージュストライク', mp: 20, desc: '敵単体に幻影を操る魔法攻撃を行い、確率で混乱させる。', flavor: '（無数の幻影を出現させ、敵の精神を乱す。敵はどれが本物か見分けられず、自滅の道をたどる。）', target: 'single' },
            { name: 'イリュージョンスモーク', mp: 30, desc: '敵全体に魔法攻撃を行い、回避率を低下させる。', flavor: '（五感を狂わせる煙幕を放つ。その煙に包まれた者は、まるで夢の中にいるかのように、現実の攻撃から逃れることができない。）', target: 'all_enemies' },
            { name: 'マインドコントロール', mp: 25, desc: '敵単体の攻撃力を一時的に低下させる。', flavor: '（敵の精神に直接干渉し、戦意を削ぐ。思考を操り、最も有利な選択肢を奪い取る。）', target: 'single' }
        ],
        special: {
            name: 'ナイトメア', mp: 75, desc: '敵単体に強力な魔法ダメージを与え、数ターン行動不能にする。', flavor: '（最も恐れている悪夢を敵に見せる。精神攻撃によるダメージは、肉体にすら影響を及ぼし、敵は恐怖に震えながら意識を失う。）', target: 'single'
        }
    },
    {
        id: 'char03', name: '弓使いレオン', role: '風の射手', image: 'images/char03.png',
        attackType: 'physical',
        status: {
            maxHp: 200, hp: 200,
            maxMp: 50, mp: 50,
            atk: 65, matk: 10,
            def: 25, mdef: 20,
            spd: 60,
            support: 15,
            criticalRate: 0.3, dodgeRate: 0.15, criticalMultiplier: 1.8
        },
        passive: {
            name: '精密射撃',
            desc: '敵単体への物理攻撃時、クリティカル率が上昇する。',
            flavor: '（どんなに遠い標的でも、風の流れを読み、一瞬の隙も見逃さない。彼の放つ矢は、必ず急所を射抜く。）'
        },
        active: [
            { name: 'クイックショット', mp: 10, desc: '敵単体に素早い連続物理攻撃を行う。', flavor: '（流れるような動作で矢を連射する。その速度は目で追うことができず、敵は気づけば無数の矢を受けている。）', target: 'single' },
            { name: 'アローレイン', mp: 25, desc: '敵全体に無数の矢を降らせる物理攻撃を行う。', flavor: '（天に向かって矢を放つと、それは無数の光となり、広範囲の敵に降り注ぐ。）', target: 'all_enemies' },
            { name: 'シャドウスティンガー', mp: 15, desc: '敵単体に物理攻撃を行い、数ターンの間、毒状態にする。', flavor: '（影に潜み、毒を塗った矢を放つ。毒はゆっくりと敵の体を蝕み、戦闘不能に追い込む。）', target: 'single' }
        ],
        special: {
            name: 'エリアルストライク', mp: 40, desc: '上空から狙いを定め、敵単体に超大な物理ダメージを与える。', flavor: '（遥か上空に跳躍し、地上の敵を完璧な位置から狙い撃つ。その一矢は、敵の装甲を貫き、致命傷を与える。）', target: 'single'
        }
    },
    {
        id: 'char04', name: '暗殺者レナ', role: '影の刃', image: 'images/char04.png',
        attackType: 'physical',
        status: {
            maxHp: 180, hp: 180,
            maxMp: 80, mp: 80,
            atk: 70, matk: 5,
            def: 20, mdef: 10,
            spd: 75,
            support: 10,
            criticalRate: 0.4, dodgeRate: 0.3, criticalMultiplier: 2.5
        },
        passive: {
            name: '影の囁き',
            desc: 'ターン開始時、自身の回避率が少し上昇する。',
            flavor: '（影と一体化し、敵の視界から姿を消す。その存在を感知できる者はほとんどいない。）'
        },
        active: [
            { name: 'デスストローク', mp: 25, desc: '敵単体に超強力な物理攻撃を行う。', flavor: '（敵の急所を的確に狙い、一瞬で勝負を決める。その一撃は、どんな強敵をも一撃で仕留める。）', target: 'single' },
            { name: 'ダブルエッジ', mp: 15, desc: '敵単体に連続物理攻撃を行い、確率で出血状態にする。', flavor: '（二本の短剣で敵を切り裂く。深い傷は止まることなく血を流し続け、敵を弱らせる。）', target: 'single' },
            { name: 'ブラインドダガー', mp: 10, desc: '敵単体に物理攻撃を行い、命中率を低下させる。', flavor: '（光を反射する特殊なナイフを投げつけ、敵の視界を眩ませる。その隙に、次の攻撃に備える。）', target: 'single' }
        ],
        special: {
            name: 'シャドウバースト', mp: 50, desc: '姿を消し、敵全体に致命的なダメージを与える。', flavor: '（闇の中へ完全に溶け込み、敵が気づいた時には既に遅い。無数の影が敵を襲い、逃げ場をなくす。）', target: 'all_enemies'
        }
    },
    {
        id: 'char05', name: '召喚師エレナ', role: '精霊の呼び声', image: 'images/char05.png',
        attackType: 'magic',
        status: {
            maxHp: 150, hp: 150,
            maxMp: 200, mp: 200,
            atk: 5, matk: 60,
            def: 20, mdef: 45,
            spd: 30,
            support: 60,
            criticalRate: 0.08, dodgeRate: 0.1, criticalMultiplier: 1.5
        },
        passive: {
            name: '共鳴する魂',
            desc: 'ターン開始時、自身のMPと、ランダムな味方単体のHPを少し回復する。',
            flavor: '（精霊との深いつながりが、彼女の魔力と仲間の生命力を同時に満たしていく。彼女の存在そのものが、パーティの支えとなる。）'
        },
        active: [
            { name: 'フレイムゴースト', mp: 25, desc: '炎の精霊を召喚し、敵単体に強力な魔法攻撃。', flavor: '（燃え盛る炎の幽霊が、敵を焼き尽くす。その熱は物理的な防御を無視し、敵の心臓を直接焼く。）', target: 'single' },
            { name: 'フロストスプライト', mp: 20, desc: '氷の精霊を召喚し、敵全体に魔法攻撃と、確率で凍結させる。', flavor: '（凍てつく息を吐く氷の妖精が、敵を氷漬けにする。その冷気は敵の動きを完全に止め、無防備にする。）', target: 'all_enemies' },
            { name: 'ガイアヒーリング', mp: 15, desc: '大地の精霊の力を借り、味方単体のHPを大きく回復する。', flavor: '（大地から湧き出る生命の力が、傷ついた肉体を癒す。どんな深手も、この力の前では無意味となる。）', target: 'ally_single' }
        ],
        special: {
            name: 'アストラルゲート', mp: 90, desc: '高位の精霊を召喚し、敵全体に超大な魔法ダメージを与える。', flavor: '（異なる次元への扉を開き、この世ならざる強大な存在を呼び出す。その存在が放つ一撃は、敵の存在そのものを消し去る。）', target: 'all_enemies'
        }
    },
    {
        id: 'char06', name: '機械兵器ゼノス', role: '鋼鉄の破壊者', image: 'images/char06.png',
        attackType: 'physical',
        status: {
            maxHp: 280, hp: 280,
            maxMp: 50, mp: 50,
            atk: 60, matk: 20,
            def: 55, mdef: 40,
            spd: 15,
            support: 5,
            criticalRate: 0.05, dodgeRate: 0.02, criticalMultiplier: 1.2
        },
        passive: {
            name: '自己修復プログラム',
            desc: 'ターン終了時、自身のHPをわずかに回復する。',
            flavor: '（戦闘のダメージを自動で計算し、内部のナノマシンが傷ついた装甲を修復していく。どんな攻撃も、彼を完全に破壊することはできない。）'
        },
        active: [
            { name: 'ガトリングバースト', mp: 15, desc: '敵単体に超高速の連続物理攻撃を行う。', flavor: '（内蔵された機関銃から無数の弾丸を放つ。その弾幕は敵の体を蜂の巣にし、抵抗する余地を与えない。）', target: 'single' },
            { name: 'ロケットパンチ', mp: 20, desc: '腕をロケットとして発射し、敵単体に物理攻撃と防御力低下のデバフを与える。', flavor: '（腕を切り離し、目標に向かって発射する。その衝撃は敵の装甲を剥ぎ取り、防御力を無力化する。）', target: 'single' },
            { name: 'グラビティフィールド', mp: 30, desc: '周囲に重力フィールドを発生させ、敵全体の素早さを低下させる。', flavor: '（内部から特殊なフィールドを発生させ、重力を増幅させる。敵の動きは鈍化し、ゼノスの攻撃から逃れることができなくなる。）', target: 'all_enemies' }
        ],
        special: {
            name: 'オーバードライブ', mp: 45, desc: '自身のステータスを一時的に大幅に上昇させる。', flavor: '（リミッターを解除し、全ての機能を最大出力で稼働させる。全身から蒸気を噴き出し、圧倒的な破壊力とスピードを手に入れる。）', target: 'self'
        }
    },
    {
        id: 'char07', name: '魔剣士ヴァイス', role: '混沌の剣', image: 'images/char07.png',
        attackType: 'hybrid',
        status: {
            maxHp: 240, hp: 240,
            maxMp: 100, mp: 100,
            atk: 55, matk: 55,
            def: 30, mdef: 30,
            spd: 35,
            support: 25,
            criticalRate: 0.2, dodgeRate: 0.15, criticalMultiplier: 1.7
        },
        passive: {
            name: '魔剣の共鳴',
            desc: '物理攻撃時に確率で魔法ダメージを追加し、魔法攻撃時に確率で物理ダメージを追加する。',
            flavor: '（彼の剣は、物理と魔法、二つの力を併せ持つ。一振りするたびに、混沌の力が周囲に渦巻く。）'
        },
        active: [
            { name: 'エナジースラッシュ', mp: 20, desc: '敵単体に物理ダメージと魔法ダメージを同時に与える。', flavor: '（剣に魔力を纏わせ、放つ一撃。物理的な斬撃と、魔力による衝撃波が、同時に敵を襲う。）', target: 'single' },
            { name: 'カオスブレイク', mp: 30, desc: '敵全体に物理攻撃を行い、確率で行動不能にする。', flavor: '（剣から放たれる混沌のオーラが、敵の精神を破壊する。その一撃を受けた者は、一時的に意識を失う。）', target: 'all_enemies' },
            { name: 'シャドウバインド', mp: 15, desc: '敵単体を闇の鎖で拘束し、数ターンの間、素早さを低下させる。', flavor: '（影から作り出された鎖が、敵の足を絡め取る。敵は動きを封じられ、無防備な状態になる。）', target: 'single' }
        ],
        special: {
            name: 'デュアル・エクスプロージョン', mp: 70, desc: '物理攻撃力と魔法攻撃力の両方を乗算したダメージを、敵単体に与える。', flavor: '（剣に宿る二つの力を最大限に解放し、爆発的なエネルギーを放つ。その爆発は、敵の存在を根底から消し去る。）', target: 'single'
        }
    },
    {
        id: 'char08', name: '神官エリス', role: '癒やしの使徒', image: 'images/char08.png',
        attackType: 'magic',
        status: {
            maxHp: 190, hp: 190,
            maxMp: 140, mp: 140,
            atk: 10, matk: 30,
            def: 25, mdef: 55,
            spd: 30,
            support: 75,
            criticalRate: 0.05, dodgeRate: 0.1, criticalMultiplier: 1.5
        },
        passive: {
            name: '聖なる祝福',
            desc: '味方全体の状態異常を毎ターン低確率で回復する。',
            flavor: '（彼女の祈りは、病や呪いを払い、仲間を護る。その存在は、戦場で傷ついた者にとって、希望そのものである。）'
        },
        active: [
            { name: 'メディックウェーブ', mp: 25, desc: '味方全体を回復し、状態異常を治癒する。', flavor: '（温かい光の波が、戦場全体を包み込む。その波に触れた者は、傷が癒され、呪いから解放される。）', target: 'all_allies' },
            { name: 'リフレッシュ', mp: 35, desc: '味方単体のHPとMPを大きく回復する。', flavor: '（神聖なエネルギーを仲間に注ぎ込み、その力を蘇らせる。疲労も魔力も完全に回復し、再び戦う力を得る。）', target: 'ally_single' },
            { name: 'サイレントホーン', mp: 10, desc: '敵単体の魔法を封じ、行動を制限する。', flavor: '（神聖な音色を放ち、敵の魔力を完全に無力化する。魔術師の詠唱を妨げ、その魔法を封じる。）', target: 'single' }
        ],
        special: {
            name: '天国の扉', mp: 120, desc: '戦闘不能の味方全てをHPとMPが最大値で復活させる。', flavor: '（神の力の一部をこの世に具現化させる。一度は命を落とした者も、この奇跡の力によって再び蘇る。）', target: 'all_allies'
        }
    }
];