// main.js

import { initOnlinePlay, startOnlineBattle } from './online.js';
import { renderBattle } from './battle.js';

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const backButton = document.getElementById('back-button');
    const startAdventureButton = document.getElementById('go-button');
    const backToTitleButton = document.getElementById('back-to-title-button');

    const titleScreen = document.getElementById('title-screen');
    const onlineScreen = document.getElementById('online-screen');
    const partyScreen = document.getElementById('party-screen');
    const battleScreen = document.getElementById('battle-screen');

    // 「オンライン対戦」ボタン
    startButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        onlineScreen.classList.remove('hidden');
        initOnlinePlay(); // online.jsの初期化処理を呼び出す
    });

    // 「戻る」ボタン（パーティー画面）
    backButton.addEventListener('click', () => {
        partyScreen.classList.add('hidden');
        onlineScreen.classList.remove('hidden');
    });

    // 「タイトルに戻る」ボタン（オンライン画面）
    backToTitleButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
    });

    // 「出撃！」ボタン
    startAdventureButton.addEventListener('click', () => {
        const partyMembers = window.getSelectedParty();
        if (partyMembers.length !== 4) {
            alert('パーティーは4人で編成してください。');
            return;
        }

        // オンライン対戦を開始する
        startOnlineBattle(partyMembers);
    });

    // オンライン対戦が始まったら、party.jsからこの関数が呼ばれる
    window.startBattleScreen = (myParty, opponentParty) => {
        partyScreen.classList.add('hidden');
        onlineScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');

        // battle.jsの描画関数を呼び出す
        renderBattle(myParty, opponentParty);
    };
});