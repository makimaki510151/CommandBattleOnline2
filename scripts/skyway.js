// scripts/skyway.js

import Peer from 'https://cdn.webrtc.ecl.ntt.com/skyway-4.4.5/skyway.min.js';

const API_KEY = 'd5450488-422b-47bf-93a0-baa8d2d3316c'; // ここにSKYWAYのAPIキーを貼り付けます

let peer = null;
let dataConnection = null;
let isHost = false;
let isConnected = false;

const myPeerIdEl = document.getElementById('my-peer-id');
const statusMessageEl = document.getElementById('status-message');

/**
 * SKYWAYに接続し、Peerオブジェクトを作成する
 */
export function initializePeer() {
    if (peer && peer.open) {
        console.log('Peer already initialized.');
        return;
    }
    console.log('Initializing Peer...');
    peer = new Peer({
        key: API_KEY,
        debug: 3
    });

    peer.on('open', (id) => {
        console.log('My Peer ID:', id);
        myPeerIdEl.textContent = `あなたのID: ${id}`;
        statusMessageEl.textContent = '準備完了。部屋を作成するか、部屋IDを入力して参加してください。';
    });

    peer.on('error', (err) => {
        console.error('Peer Error:', err);
        statusMessageEl.textContent = `エラー: ${err.message}`;
        alert('SKYWAYの初期化に失敗しました。APIキーを確認してください。');
    });

    // 部屋作成者側が接続を受け付けたときの処理
    peer.on('connection', (connection) => {
        console.log('Incoming connection from:', connection.peer);
        dataConnection = connection;
        setupConnectionEvents();
        statusMessageEl.textContent = `${connection.peer}が参加しました。`;
    });
}

/**
 * 部屋を作成する（ホストになる）
 * @param {string} roomId - 部屋ID
 */
export function createRoom(roomId) {
    if (!peer || !peer.open) {
        statusMessageEl.textContent = 'SKYWAYが準備できていません。しばらく待ってから再度お試しください。';
        return;
    }
    isHost = true;
    isConnected = true;
    statusMessageEl.textContent = `部屋「${roomId}」を作成しました。他のプレイヤーの参加を待っています。`;
    
    // 実際には部屋のIDを外部で管理する必要があるが、今回はUIで表示するIDをそのまま利用
    // 参加者がconnectしてくるのを待つ
}

/**
 * 部屋に参加する
 * @param {string} roomId - 部屋ID
 */
export function joinRoom(roomId) {
    if (!peer || !peer.open) {
        statusMessageEl.textContent = 'SKYWAYが準備できていません。しばらく待ってから再度お試しください。';
        return;
    }
    dataConnection = peer.connect(roomId);
    setupConnectionEvents();
    isHost = false;
}

/**
 * DataConnectionのイベントを設定する
 */
function setupConnectionEvents() {
    dataConnection.on('open', () => {
        console.log('DataConnection opened!');
        isConnected = true;
        statusMessageEl.textContent = `接続完了！ゲームを開始できます。`;

        // 相手にパーティー情報を送信
        if (window.getSelectedParty) {
            sendPartyData(window.getSelectedParty());
        }
    });

    dataConnection.on('data', (data) => {
        console.log('Received data:', data);
        if (data.type === 'party_data') {
            window.setOpponentParty(data.party);
        } else if (data.type === 'start_battle') {
            window.startMultiplayerBattle();
        } else if (data.type === 'command_action') {
            window.receiveCommand(data.action);
        }
    });

    dataConnection.on('close', () => {
        console.log('DataConnection closed.');
        isConnected = false;
        statusMessageEl.textContent = '接続が切断されました。';
    });

    dataConnection.on('error', (err) => {
        console.error('DataConnection Error:', err);
        statusMessageEl.textContent = `接続エラー: ${err.message}`;
    });
}

/**
 * データを相手に送信する
 * @param {object} data - 送信するデータ
 */
export function sendData(data) {
    if (dataConnection && dataConnection.open) {
        dataConnection.send(data);
    } else {
        console.error('Connection is not open.');
    }
}

/**
 * 自分のパーティーデータを送信する
 * @param {Array} party - プレイヤーパーティーの配列
 */
export function sendPartyData(party) {
    if (isConnected) {
        sendData({
            type: 'party_data',
            party: party
        });
    }
}

export function isPeerConnected() {
    return isConnected;
}

export function isHostPeer() {
    return isHost;
}