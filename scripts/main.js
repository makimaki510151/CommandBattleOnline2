// main.js

document.addEventListener('DOMContentLoaded', () => {
    const onlineButton = document.getElementById('online-button');
    const backButton = document.getElementById('back-button');
    const goButton = document.getElementById('go-button');
    const createRoomButton = document.getElementById('create-room-button');
    const joinRoomButton = document.getElementById('join-room-button');
    const roomIdInput = document.getElementById('room-id-input');
    const statusMessage = document.getElementById('status-message');

    
    const titleScreen = document.getElementById('title-screen');
    const partyScreen = document.getElementById('party-screen');
    const onlineBattleScreen = document.getElementById('online-battle-screen');
    const battleScreen = document.getElementById('battle-screen');

    // 「オンライン対戦」ボタン
    onlineButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        onlineBattleScreen.classList.remove('hidden');
    });

    // 「戻る」ボタン
    backButton.addEventListener('click', () => {
        partyScreen.classList.add('hidden');
        onlineBattleScreen.classList.remove('hidden');
    });

    // 「新規ルームを作成」ボタン
    createRoomButton.addEventListener('click', () => {
        const roomId = 'room-' + Math.random().toString(36).substr(2, 9);
        roomIdInput.value = roomId;
        statusMessage.textContent = 'ルームを作成中...';
        window.connectToSkyWay(roomId, 'create');
    });

    // 「ルームに参加」ボタン
    joinRoomButton.addEventListener('click', () => {
        const roomId = roomIdInput.value;
        if (roomId) {
            statusMessage.textContent = 'ルームに参加中...';
            window.connectToSkyWay(roomId, 'join');
        } else {
            alert('ルームIDを入力してください。');
        }
    });

    // ルーム接続成功時の処理（online-battle.jsから呼び出される）
    window.onRoomConnected = () => {
        onlineBattleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
    };

    // 「出かける」ボタン (オンライン対戦用)
    goButton.addEventListener('click', async () => {
        const partyMembers = window.getSelectedParty();
        if (partyMembers.length !== 4) {
            alert('パーティーは4人で編成してください。');
            return;
        }

        partyScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');

        // 選択したパーティーデータを相手に送信し、バトルを開始
        window.startOnlineBattle(partyMembers);
    });
});