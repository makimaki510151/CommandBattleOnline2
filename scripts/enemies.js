// enemies.js

// 単体の敵データ（プレイヤー4体分の火力・耐久に合わせて調整）
export const enemyData = [
    {
        id: 'enemy01', name: 'スライム', image: 'images/enemy01.png',
        status: { maxHp: 110, hp: 110, maxMp: 0, mp: 0, atk: 18, def: 12, matk: 0, mdef: 8, spd: 18, criticalRate: 0.05, dodgeRate: 0.1, criticalMultiplier: 1.5 }
    },
    {
        id: 'enemy02', name: 'ゴブリン', image: 'images/enemy02.png',
        status: { maxHp: 165, hp: 165, maxMp: 8, mp: 8, atk: 30, def: 22, matk: 4, mdef: 12, spd: 32, criticalRate: 0.08, dodgeRate: 0.08, criticalMultiplier: 1.5 }
    },
    {
        id: 'enemy03', name: 'オーク', image: 'images/enemy03.png',
        status: { maxHp: 240, hp: 240, maxMp: 12, mp: 12, atk: 42, def: 35, matk: 8, mdef: 18, spd: 24, criticalRate: 0.05, dodgeRate: 0.05, criticalMultiplier: 1.5 }
    },
    {
        id: 'enemy04', name: 'スケルトン', image: 'images/enemy04.png',
        status: { maxHp: 140, hp: 140, maxMp: 4, mp: 4, atk: 26, def: 18, matk: 4, mdef: 10, spd: 42, criticalRate: 0.12, dodgeRate: 0.12, criticalMultiplier: 1.5 }
    },
    {
        id: 'enemy05', name: 'オーガ', image: 'images/enemy05.png',
        status: { maxHp: 420, hp: 420, maxMp: 16, mp: 16, atk: 58, def: 48, matk: 12, mdef: 26, spd: 14, criticalRate: 0.06, dodgeRate: 0.02, criticalMultiplier: 1.5 }
    },
    {
        id: 'enemy06', name: 'ドラゴン', image: 'images/enemy06.png',
        status: { maxHp: 720, hp: 720, maxMp: 18, mp: 45, atk: 68, def: 55, matk: 48, mdef: 42, spd: 36, criticalRate: 0.15, dodgeRate: 0.05, criticalMultiplier: 1.8 }
    }
];

// 敵のグループ設定
export const enemyGroups = [
    {
        name: 'グループ1',
        enemies: ['enemy01', 'enemy02'] // スライムとゴブリン
    },
    {
        name: 'グループ2',
        enemies: ['enemy02', 'enemy03', 'enemy04'] // ゴブリン、オーク、スケルトン
    },
    {
        name: 'グループ3',
        enemies: ['enemy05', 'enemy03', 'enemy03'] // オーガとオーク2体
    },
    {
        name: 'グループ4',
        enemies: ['enemy06'] // ドラゴン
    }
];

