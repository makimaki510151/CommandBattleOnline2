// enemies.js

// 単体の敵データ
export const enemyData = [
    {
        id: 'enemy01', name: 'スライム', image: 'images/enemy01.png',
        status: { maxHp: 120, hp: 120, maxMp: 0, mp: 0, atk: 20, def: 15, matk: 0, mdef: 10, spd: 20, criticalRate: 0.05, dodgeRate: 0.1, criticalMultiplier: 1.5 }
    },
    {
        id: 'enemy02', name: 'ゴブリン', image: 'images/enemy02.png',
        status: { maxHp: 180, hp: 180, maxMp: 10, mp: 10, atk: 35, def: 25, matk: 5, mdef: 15, spd: 35, criticalRate: 0.1, dodgeRate: 0.08, criticalMultiplier: 1.5 }
    },
    {
        id: 'enemy03', name: 'オーク', image: 'images/enemy03.png',
        status: { maxHp: 250, hp: 250, maxMp: 15, mp: 15, atk: 50, def: 40, matk: 10, mdef: 20, spd: 25, criticalRate: 0.05, dodgeRate: 0.05, criticalMultiplier: 1.5 }
    },
    {
        id: 'enemy04', name: 'スケルトン', image: 'images/enemy04.png',
        status: { maxHp: 150, hp: 150, maxMp: 5, mp: 5, atk: 30, def: 20, matk: 5, mdef: 10, spd: 45, criticalRate: 0.15, dodgeRate: 0.15, criticalMultiplier: 1.5 }
    },
    {
        id: 'enemy05', name: 'オーガ', image: 'images/enemy05.png',
        status: { maxHp: 500, hp: 500, maxMp: 20, mp: 20, atk: 70, def: 55, matk: 15, mdef: 30, spd: 15, criticalRate: 0.08, dodgeRate: 0.02, criticalMultiplier: 1.5 }
    },
    {
        id: 'enemy06', name: 'ドラゴン', image: 'images/enemy06.png',
        status: { maxHp: 1000, hp: 1000, maxMp: 50, mp: 50, atk: 90, def: 70, matk: 60, mdef: 50, spd: 40, criticalRate: 0.2, dodgeRate: 0.05, criticalMultiplier: 2.0 }
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