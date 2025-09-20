// main.js

import { initOnlinePlay } from './online.js';

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const onlineButton = document.getElementById('online-button');
    const backButton = document.getElementById('back-button');
    const onlineBackButton = document.getElementById('online-back-button');
    const startAdventureButton = document.getElementById('go-button');

    const titleScreen = document.getElementById('title-screen');
    const onlineScreen = document.getElementById('online-screen');
    const partyScreen = document.getElementById('party-screen');
    const battleScreen = document.getElementById('battle-screen');

    // 「冒険開始」ボタン (オフライン)
    startButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        // オフライン用のパーティー編成を初期化するロジックが必要になります
    });

    // 「オンライン対戦」ボタン
    onlineButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        onlineScreen.classList.remove('hidden');
        initOnlinePlay(); // オンラインプレイの初期化
    });

    // 「パーティー画面に戻る」ボタン
    backButton.addEventListener('click', () => {
        partyScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
    });

    // 「オンライン対戦に戻る」ボタン
    onlineBackButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
    });

    // 「出かける」ボタン (オンライン)
    startAdventureButton.addEventListener('click', () => {
        const partyMembers = window.getSelectedParty();
        if (partyMembers.length !== 4) {
            alert('パーティーは4人で編成してください。');
            return;
        }

        partyScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');

        // オンライン対戦を開始する関数を呼び出す
        window.startOnlineBattle(partyMembers);
    });
});