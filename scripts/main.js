// main.js

import { initializePeer, createRoom, joinRoom, isPeerConnected, isHostPeer, sendData } from './skyway.js';

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const multiPlayButton = document.getElementById('multi-play-button');
    const createRoomButton = document.getElementById('create-room-button');
    const joinRoomButton = document.getElementById('join-room-button');
    const backButton = document.getElementById('back-button');
    const startAdventureButton = document.getElementById('go-button');

    const titleScreen = document.getElementById('title-screen');
    const partyScreen = document.getElementById('party-screen');
    const battleScreen = document.getElementById('battle-screen');
    const multiPlayUI = document.getElementById('multi-play-ui');
    const roomIdInput = document.getElementById('room-id-input');

    // 「シングルプレイ」ボタン
    startButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
    });

    // 「マルチプレイ」ボタン
    multiPlayButton.addEventListener('click', () => {
        multiPlayButton.classList.add('hidden');
        multiPlayUI.classList.remove('hidden');
        initializePeer();
    });

    // 「部屋を作成」ボタン
    createRoomButton.addEventListener('click', () => {
        const roomId = roomIdInput.value.trim();
        if (roomId === '') {
            alert('部屋IDを入力してください。');
            return;
        }
        createRoom(roomId);
        partyScreen.classList.remove('hidden');
        titleScreen.classList.add('hidden');
    });

    // 「部屋に参加」ボタン
    joinRoomButton.addEventListener('click', () => {
        const roomId = roomIdInput.value.trim();
        if (roomId === '') {
            alert('部屋IDを入力してください。');
            return;
        }
        joinRoom(roomId);
        partyScreen.classList.remove('hidden');
        titleScreen.classList.add('hidden');
    });

    // 「戻る」ボタン
    backButton.addEventListener('click', () => {
        partyScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        // マルチプレイUIを隠す
        multiPlayUI.classList.add('hidden');
        multiPlayButton.classList.remove('hidden');
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
        
        // マルチプレイ接続済みの場合、戦闘開始コマンドを送信
        if (isPeerConnected()) {
            sendData({ type: 'start_battle' });
            window.startMultiplayerBattle();
        } else {
            // シングルプレイの場合
            window.startBattle(); // 戦闘開始
        }
    });
});