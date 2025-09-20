// online-battle.js
import { characters } from './characters.js';
import { calculateDamage, performAttack, performSkill, checkWinCondition, logMessage } from './battle-logic.js';

let myPeerId = '';
let opponentPeerId = '';
let opponentParty = [];
let myParty = [];
let myTurn = false;

const battleScreenEl = document.getElementById('battle-screen');
const playerPartyEl = document.getElementById('player-party');
const opponentPartyEl = document.getElementById('opponent-party');
const commandAreaEl = document.getElementById('command-area');
const messageLogEl = document.getElementById('message-log');

let activePlayerIndex = 0;
let actionTaken = false;

// SKYWAY Peerの初期化
const API_KEY = 'd5450488-422b-47bf-93a0-baa8d2d3316c'; // ここにあなたのAPIキーを貼り付けてください

if (!API_KEY || API_KEY === 'YOUR_API_KEY') {
    alert('SKYWAY APIキーが設定されていません。online-battle.jsを開き、APIキーを設定してください。');
}

window.connectToSkyWay = async (roomId, type) => {
    try {
        const context = new SkyWayContext({ apiKey: API_KEY });
        const room = new SkyWayRoom(context, {
            name: roomId,
            type: 'p2p'
        });

        room.on('open', () => {
            document.getElementById('status-message').textContent = '接続中...';
        });

        let dataStream;

        if (type === 'create') {
            await room.join();
            document.getElementById('status-message').textContent = `ルームID: ${roomId} を作成しました。相手の接続を待っています...`;
            room.on('peerJoined', (peer) => {
                logMessage(`${peer.id}がルームに参加しました。`, 'system');
                opponentPeerId = peer.id;
                dataStream = room.sendData({
                    id: 'data-stream'
                });
                // 接続成功を通知
                window.onRoomConnected();
            });
        } else {
            await room.join();
            document.getElementById('status-message').textContent = 'ルームに参加しました。';
            opponentPeerId = room.getPeerList()[0]?.id;
            dataStream = room.sendData({
                id: 'data-stream'
            });
            // 接続成功を通知
            window.onRoomConnected();
        }

        dataStream.on('data', (data) => {
            const message = JSON.parse(data);
            handleDataMessage(message);
        });

    } catch (error) {
        document.getElementById('status-message').textContent = `接続エラー: ${error.message}`;
        console.error('Connection error:', error);
    }
};

window.startOnlineBattle = async (playerParty) => {
    myParty = playerParty;
    await sendPartyData();
};

function sendData(message) {
    const dataStream = room.getDataStream({ id: 'data-stream' });
    if (dataStream) {
        dataStream.write(JSON.stringify(message));
    }
}

function handleDataMessage(message) {
    switch (message.type) {
        case 'partyData':
            opponentParty = message.data;
            logMessage('対戦相手のパーティーが到着しました！', 'system');
            updateDisplay();
            if (myParty.length === 4) {
                // 両方のパーティーが揃ったらバトル開始の合図
                sendData({ type: 'ready' });
            }
            break;
        case 'ready':
            logMessage('相手の準備が完了しました。', 'system');
            if (myParty.length === 4 && opponentParty.length === 4) {
                // バトル開始
                startBattle();
            }
            break;
        case 'action':
            // 相手の行動を処理
            executeOpponentAction(message.data);
            break;
        case 'turnStart':
            // 相手からターン開始の通知
            logMessage('あなたのターンです。', 'system');
            myTurn = true;
            // ターン開始処理
            handleTurnStart();
            break;
        case 'turnEnd':
            // 相手からターン終了の通知
            myTurn = false;
            logMessage('相手のターンです。', 'system');
            // 相手の行動を待機
            break;
        case 'updateState':
            // 相手のパーティー状態を更新
            opponentParty = message.data.opponentParty;
            myParty = message.data.myParty;
            updateDisplay();
            break;
    }
}

function startBattle() {
    logMessage('対戦開始！', 'system');
    // 先攻後攻を決定
    myTurn = Math.random() < 0.5;
    if (myTurn) {
        logMessage('あなたのターンです。', 'system');
        handleTurnStart();
    } else {
        logMessage('相手のターンです。', 'system');
    }
}

function handleTurnStart() {
    actionTaken = false;
    // UIを有効化
    commandAreaEl.classList.remove('hidden');
    // 最初のキャラクターの行動選択
    selectCommand(0);
}

function selectCommand(playerIndex) {
    // プレイヤーキャラクターのアクティブ表示
    const players = playerPartyEl.querySelectorAll('.player-character');
    players.forEach(p => p.classList.remove('active'));
    players[playerIndex].classList.add('active');

    // コマンドUIの更新
    updateCommandMenu(myParty[playerIndex]);
}

function updateCommandMenu(player) {
    // 既存のバトルロジックから流用
    commandAreaEl.innerHTML = `
        <div class="commands">
            <button class="command-button action-attack">攻撃</button>
            <button class="command-button action-skill">特技</button>
        </div>
        <div class="skill-menu hidden">
        </div>
    `;

    document.querySelector('.action-attack').addEventListener('click', () => {
        // 攻撃対象選択
        logMessage('攻撃する対象を選択してください。');
        selectTarget().then(targetIndex => {
            const target = opponentParty[targetIndex];
            const action = {
                type: 'attack',
                attackerIndex: activePlayerIndex,
                targetIndex: targetIndex
            };
            sendData({ type: 'action', data: action });
            executeMyAction(action);
        });
    });

    document.querySelector('.action-skill').addEventListener('click', () => {
        // スキルメニュー表示
        const skillMenuEl = commandAreaEl.querySelector('.skill-menu');
        skillMenuEl.classList.remove('hidden');
        skillMenuEl.innerHTML = player.active.map(skill => `<button class="skill-button" data-skill-name="${skill.name}">${skill.name}</button>`).join('');

        document.querySelectorAll('.skill-button').forEach(button => {
            button.addEventListener('click', () => {
                const skillName = button.dataset.skillName;
                const skill = player.active.find(s => s.name === skillName);
                if (skill.target === 'single') {
                    // 単体スキル
                    logMessage('スキルを使用する対象を選択してください。');
                    selectTarget().then(targetIndex => {
                        const action = {
                            type: 'skill',
                            attackerIndex: activePlayerIndex,
                            targetIndex: targetIndex,
                            skill: skill
                        };
                        sendData({ type: 'action', data: action });
                        executeMyAction(action);
                    });
                } else if (skill.target === 'all') {
                    // 全体スキル
                    const action = {
                        type: 'skill',
                        attackerIndex: activePlayerIndex,
                        targetIndex: -1, // 全体対象
                        skill: skill
                    };
                    sendData({ type: 'action', data: action });
                    executeMyAction(action);
                }
            });
        });
    });
}

async function selectTarget() {
    return new Promise(resolve => {
        const targetElements = opponentPartyEl.querySelectorAll('.player-character');
        targetElements.forEach((el, index) => {
            el.classList.add('selectable');
            el.addEventListener('click', () => {
                targetElements.forEach(t => t.classList.remove('selectable'));
                resolve(index);
            }, { once: true });
        });
    });
}

function executeMyAction(action) {
    if (action.type === 'attack') {
        performAttack(myParty[action.attackerIndex], opponentParty[action.targetIndex]);
    } else if (action.type === 'skill') {
        performSkill(myParty[action.attackerIndex], opponentParty, myParty, action.skill, action.targetIndex);
    }
    updateDisplay();
    // 相手に状態を送信
    sendData({ type: 'updateState', data: { myParty, opponentParty } });

    // 次のターンへ
    myTurn = false;
    sendData({ type: 'turnEnd' });
}

function executeOpponentAction(action) {
    if (action.type === 'attack') {
        performAttack(opponentParty[action.attackerIndex], myParty[action.targetIndex]);
    } else if (action.type === 'skill') {
        performSkill(opponentParty[action.attackerIndex], myParty, opponentParty, action.skill, action.targetIndex);
    }
    updateDisplay();

    // 自分のターン開始を相手に通知
    myTurn = true;
    sendData({ type: 'turnStart' });
}

function updateDisplay() {
    updatePartyDisplay(playerPartyEl, myParty);
    updatePartyDisplay(opponentPartyEl, opponentParty);
    checkWinCondition(myParty, opponentParty);
}

function updatePartyDisplay(partyElement, party) {
    partyElement.innerHTML = '';
    party.forEach(char => {
        const charEl = document.createElement('div');
        charEl.className = 'player-character';
        charEl.innerHTML = `
            <img src="${char.image}" alt="${char.name}" style="transform: scaleX(${partyElement.id === 'opponent-party' ? '-1' : '1'});">
            <h4>${char.name}</h4>
            <div class="hp-bar-container"><div class="hp-bar" style="width: ${char.status.hp / char.status.maxHp * 100}%;"></div></div>
            <p>HP: ${char.status.hp}/${char.status.maxHp}</p>
        `;
        partyElement.appendChild(charEl);
    });
}

// 共通ロジックをまとめたファイル
// この部分は、以前の `battle.js` から移植したものです
window.calculateDamage = function (attacker, defender, isMagic = false) {
    // ダメージ計算ロジック
    const atk = isMagic ? attacker.status.matk : attacker.status.atk;
    const def = isMagic ? defender.status.mdef : defender.status.def;
    const damage = Math.max(0, atk - def / 2) + Math.floor(Math.random() * 10);
    return damage;
}

window.performAttack = function (attacker, defender) {
    // 攻撃ロジック
    const damage = calculateDamage(attacker, defender);
    defender.status.hp = Math.max(0, defender.status.hp - damage);
    logMessage(`${attacker.name}の攻撃！ ${defender.name}に${damage}のダメージ！`);
}

window.performSkill = function (caster, targets, allies, skill, targetIndex) {
    // スキルロジック
    // ここでは単純な攻撃スキルのみを実装
    logMessage(`${caster.name}が「${skill.name}」を発動！`);
    if (skill.target === 'single') {
        const target = targets[targetIndex];
        const damage = calculateDamage(caster, target, skill.attackType === 'magic');
        target.status.hp = Math.max(0, target.status.hp - damage);
        logMessage(`${target.name}に${damage}のダメージ！`);
    } else if (skill.target === 'all') {
        targets.forEach(target => {
            const damage = calculateDamage(caster, target, skill.attackType === 'magic');
            target.status.hp = Math.max(0, target.status.hp - damage);
            logMessage(`${target.name}に${damage}のダメージ！`);
        });
    }
}

window.checkWinCondition = function (playerParty, opponentParty) {
    const playerLost = playerParty.every(char => char.status.hp <= 0);
    const opponentLost = opponentParty.every(char => char.status.hp <= 0);
    if (playerLost) {
        logMessage('あなたの負けです...', 'system');
        // 終了処理
    } else if (opponentLost) {
        logMessage('あなたの勝利です！', 'system');
        // 終了処理
    }
}

window.logMessage = function (message, type) {
    const p = document.createElement('p');
    p.textContent = message;
    if (type) {
        p.classList.add(`log-message`, type);
    }
    messageLogEl.appendChild(p);
    messageLogEl.scrollTop = messageLogEl.scrollHeight;
}