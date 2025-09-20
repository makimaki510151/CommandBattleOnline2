// online.js

import { getSelectedParty } from './party.js';
import { executeRemoteAction } from './battle.js';

const API_KEY = 'd5450488-422b-47bf-93a0-baa8d2d3316c'; // あなたのAPIキー
const peerIdInput = document.getElementById('peer-id-input');
const connectButton = document.getElementById('connect-button');
const hostButton = document.getElementById('host-button');
const myIdEl = document.getElementById('my-id');
const connectionStatusEl = document.getElementById('connection-status');

let peer = null;
let dataConnection = null;
let myParty = null;
let opponentParty = null;

// SKYWAYの初期化
export function initOnlinePlay() {
    // 既存のピア接続があれば破棄
    if (peer && !peer.destroyed) {
        peer.destroy();
    }

    peer = new Peer({ key: API_KEY, debug: 3 });

    // 自分のIDが発行された時
    peer.on('open', (id) => {
        myIdEl.textContent = id;
        connectionStatusEl.textContent = '接続待機中';
    });

    // 相手からデータ通信リクエストがあった時（ホスト側）
    peer.on('connection', (connection) => {
        dataConnection = connection;
        setupDataConnection();
    });

    // エラーハンドリング
    peer.on('error', (err) => {
        console.error('Peer error:', err);
        connectionStatusEl.textContent = `エラー: ${err.type}`;
        alert(`Peer Connection Error: ${err.message}`);
    });

    // 接続ボタン
    connectButton.addEventListener('click', () => {
        const peerId = peerIdInput.value;
        if (!peerId) {
            alert('相手のIDを入力してください。');
            return;
        }
        dataConnection = peer.connect(peerId);
        setupDataConnection();
    });

    // ホストボタン
    hostButton.addEventListener('click', () => {
        alert('あなたのIDを相手に伝えてください。');
    });
}

// データ通信のセットアップ
function setupDataConnection() {
    connectionStatusEl.textContent = '接続中...';
    dataConnection.on('open', () => {
        connectionStatusEl.textContent = '接続完了！パーティー編成へ';
        setTimeout(() => {
            document.getElementById('online-screen').classList.add('hidden');
            document.getElementById('party-screen').classList.remove('hidden');
        }, 1500); // 1.5秒後に画面遷移
    });

    // 相手からデータが届いた時
    dataConnection.on('data', (data) => {
        console.log('Received data:', data);
        if (data.type === 'party_data') {
            opponentParty = data.payload;
            checkAndStartBattle();
        } else if (data.type === 'battle_action') {
            // battle.jsの関数を呼び出し、相手のアクションを実行
            executeRemoteAction(data.payload);
        }
    });

    dataConnection.on('close', () => {
        connectionStatusEl.textContent = '接続が切断されました';
        alert('相手との接続が切断されました。');
        // 必要に応じてゲームをリセット
        location.reload();
    });

    dataConnection.on('error', (err) => {
        console.error('DataConnection error:', err);
        connectionStatusEl.textContent = `データ通信エラー: ${err.type}`;
    });
}

// パーティー編成後の処理
export function startOnlineBattle(party) {
    myParty = party;
    // 相手に自分のパーティーデータを送信
    dataConnection.send({ type: 'party_data', payload: myParty });
    checkAndStartBattle();
}

// 双方のパーティーデータが揃ったか確認し、戦闘を開始
function checkAndStartBattle() {
    if (myParty && opponentParty) {
        window.startBattleScreen(myParty, opponentParty);
    }
}

// battle.jsから呼び出される、相手にアクションを送信する関数
export function sendBattleAction(action) {
    if (dataConnection && dataConnection.open) {
        dataConnection.send({ type: 'battle_action', payload: action });
    } else {
        console.error('DataConnection is not open.');
    }
}