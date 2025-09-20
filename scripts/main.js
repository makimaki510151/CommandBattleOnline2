// main.js

import { startBattle } from './battle.js'; // startBattle関数をインポート

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const backButton = document.getElementById('back-button');
    const startAdventureButton = document.getElementById('go-button');

    const titleScreen = document.getElementById('title-screen');
    const partyScreen = document.getElementById('party-screen');
    const battleScreen = document.getElementById('battle-screen');

    // オンライン対戦用UIの要素を取得
    const onlineLobby = document.getElementById('online-lobby');
    const myIdEl = document.getElementById('my-id');
    const theirIdInput = document.getElementById('their-id-input');
    const connectButton = document.getElementById('connect-button');

    // SkyWayのAPIキーをここに設定してください
    const API_KEY = 'd5450488-422b-47bf-93a0-baa8d2d3316c'; // ここをあなたのAPIキーに置き換えてください

    let peer = null;
    let dataConnection = null;

    // 「冒険開始」ボタン -> オンラインロビーへ
    startButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        onlineLobby.classList.remove('hidden');

        // Peerオブジェクトを初期化
        peer = new Peer({
            key: API_KEY,
            debug: 3
        });

        // Peer IDをUIに表示
        peer.on('open', id => {
            myIdEl.textContent = id;
            console.log('My ID: ' + id);
        });

        // 相手からの接続を待機
        peer.on('connection', conn => {
            dataConnection = conn;
            dataConnection.on('open', () => {
                console.log('Data connection established!');
                alert('相手が接続しました！');
                onlineLobby.classList.add('hidden');
                partyScreen.classList.remove('hidden');
            });
        });

        // グローバルにアクセス可能にする
        window.peer = peer;
        window.dataConnection = dataConnection;
    });

    // 「接続」ボタン
    connectButton.addEventListener('click', () => {
        const theirId = theirIdInput.value;
        if (!theirId) {
            alert('相手のIDを入力してください。');
            return;
        }

        // 相手に接続
        dataConnection = peer.connect(theirId);
        dataConnection.on('open', () => {
            console.log('Data connection established!');
            alert('相手に接続しました！');
            onlineLobby.classList.add('hidden');
            partyScreen.classList.remove('hidden');
        });
        
        // グローバルにアクセス可能にする
        window.dataConnection = dataConnection;
    });

    // 「戻る」ボタン
    backButton.addEventListener('click', () => {
        partyScreen.classList.add('hidden');
        onlineLobby.classList.remove('hidden');
    });

    // 「出かける」ボタン
    startAdventureButton.addEventListener('click', () => {
        const partyMembers = window.getSelectedParty();
        if (partyMembers.length !== 4) {
            alert('パーティーは4人で編成してください。');
            return;
        }

        partyScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');
        
        // ローカルでの戦闘開始ではなく、オンライン対戦開始を呼び出す
        startBattle(partyMembers); 
    });
});