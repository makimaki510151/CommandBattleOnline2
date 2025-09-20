// main.js

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const backButton = document.getElementById('back-button');
    const hostButton = document.getElementById('host-button');
    const joinButton = document.getElementById('join-button');
    const peerIdInput = document.getElementById('peer-id-input');

    const titleScreen = document.getElementById('title-screen');
    const partyScreen = document.getElementById('party-screen');
    const battleScreen = document.getElementById('battle-screen');
    const joinContainer = document.getElementById('join-container');
    const myPeerIdElement = document.getElementById('my-peer-id');

    // ★ SkyWayのAPIキーを設定
    const API_KEY = 'YOUR_SKYWAY_API_KEY';
    let peer = null;
    let dataChannel = null;

    // 「冒険開始」ボタン
    startButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        // パーティー画面に遷移した際、SkyWayのPeerインスタンスを作成
        if (!peer) {
            peer = new Peer({
                key: API_KEY,
                debug: 3
            });

            // PeerインスタンスのIDを取得
            peer.on('open', () => {
                myPeerIdElement.textContent = `あなたのID: ${peer.id}`;
            });

            // 相手からの接続要求を待機
            peer.on('connection', connection => {
                dataChannel = connection;
                alert('プレイヤーが見つかりました！');
                startBattleWithDataChannel(dataChannel);
            });

            peer.on('error', err => {
                console.error('SkyWay Error:', err);
            });
        }
    });

    // 「戻る」ボタン
    backButton.addEventListener('click', () => {
        partyScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        // Peerインスタンスを破棄して再利用できるようにする
        if (peer) {
            peer.destroy();
            peer = null;
        }
        joinContainer.classList.add('hidden');
        myPeerIdElement.textContent = '';
    });

    // 「ホストとして開始」ボタン
    hostButton.addEventListener('click', () => {
        const partyMembers = window.getSelectedParty();
        if (partyMembers.length !== 4) {
            alert('パーティーは4人で編成してください。');
            return;
        }
        alert('パーティーメンバーが揃いました。相手の接続を待機中です...');
        joinContainer.classList.remove('hidden');
    });

    // 「参加」ボタン
    joinButton.addEventListener('click', () => {
        const partyMembers = window.getSelectedParty();
        if (partyMembers.length !== 4) {
            alert('パーティーは4人で編成してください。');
            return;
        }
        const peerId = peerIdInput.value;
        if (!peerId) {
            alert('相手のIDを入力してください。');
            return;
        }

        // 相手に接続
        const connection = peer.connect(peerId, {
            reliable: true
        });

        connection.on('open', () => {
            dataChannel = connection;
            alert('プレイヤーが見つかりました！');
            startBattleWithDataChannel(dataChannel);
        });

        connection.on('error', err => {
            console.error('Connection Error:', err);
            alert('接続に失敗しました。IDを確認してください。');
        });
    });
    
    // 対戦を開始し、データチャネルをbattle.jsに渡す関数
    function startBattleWithDataChannel(channel) {
        partyScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');
        // battle.jsの開始関数を呼び出し、通信用のchannelを渡す
        window.startBattle(channel);
    }
});