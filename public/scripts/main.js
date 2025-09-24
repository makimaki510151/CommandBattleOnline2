// main.js (手動SDP交換版 - UI表示)

// グローバル変数と定数
const STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.ekiga.net' },
    { urls: 'stun:stun.xten.com' }
];

let peerConnection = null;
let dataChannel = null;
let isOnlineMode = false;
let isHost = false;

// グローバルスコープでDOM要素を宣言
let onlinePartyGoButton;
let myPeerIdEl;
let connectionStatusEl;
let peerIdInput;
let goButton;
let hostUiEl;
let clientUiEl;
let showHostUiButton;
let showClientUiButton;
let startHostConnectionButton;
let connectToRoomButton;
let onlineScreen;

// グローバルにアクセス可能な変数と関数
window.isOnlineMode = () => isOnlineMode;
window.isHost = () => isHost;

// ログ表示関数をグローバルに公開
window.logMessage = (message, type) => {
    const p = document.createElement('p');
    p.textContent = message;
    if (type) {
        p.classList.add('log-message', type);
    }
    const messageLogEl = document.getElementById('message-log');
    if (messageLogEl) {
        messageLogEl.appendChild(p);
        messageLogEl.scrollTop = messageLogEl.scrollHeight;
    }
};

// DOMが読み込まれた後に初期化
document.addEventListener('DOMContentLoaded', () => {
    onlinePartyGoButton = document.getElementById('online-party-go-button');
    myPeerIdEl = document.getElementById('my-peer-id');
    connectionStatusEl = document.getElementById('connection-status');
    peerIdInput = document.getElementById('peer-id-input');
    goButton = document.getElementById('go-button');
    hostUiEl = document.getElementById('host-ui');
    clientUiEl = document.getElementById('client-ui');
    showHostUiButton = document.getElementById('show-host-ui-button');
    showClientUiButton = document.getElementById('show-client-ui-button');
    startHostConnectionButton = document.getElementById('start-host-connection-button');
    connectToRoomButton = document.getElementById('connect-to-room-button');
    onlineScreen = document.getElementById('online-screen');
    
    // イベントリスナー設定
    document.getElementById('online-button').addEventListener('click', () => {
        isOnlineMode = true;
        document.getElementById('title-screen').classList.add('hidden');
        onlineScreen.classList.remove('hidden');
    });

    document.getElementById('back-to-title-button').addEventListener('click', () => {
        cleanupConnection();
        isOnlineMode = false;
        onlineScreen.classList.add('hidden');
        document.getElementById('title-screen').classList.remove('hidden');
    });

    showHostUiButton.addEventListener('click', () => {
        isHost = true;
        hostUiEl.classList.remove('hidden');
        clientUiEl.classList.add('hidden');
        window.logMessage('ホストモードに切り替えました。');
    });

    showClientUiButton.addEventListener('click', () => {
        isHost = false;
        hostUiEl.classList.add('hidden');
        clientUiEl.classList.remove('hidden');
        window.logMessage('クライアントモードに切り替えました。');
    });

    startHostConnectionButton.addEventListener('click', async () => {
        window.logMessage('PeerConnectionのセットアップを開始します...', 'info');
        setupPeerConnection();

        // 接続状態の監視
        peerConnection.onconnectionstatechange = () => {
            console.log('PeerConnection State:', peerConnection.connectionState);
            connectionStatusEl.textContent = `接続状態: ${peerConnection.connectionState}`;
            if (peerConnection.connectionState === 'connected') {
                window.logMessage('✅ プレイヤーが接続しました！', 'success');
                onlinePartyGoButton.classList.remove('hidden');
                if (goButton) {
                    goButton.disabled = false;
                }
            } else if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
                window.logMessage('接続が切断されました。', 'error');
                cleanupConnection();
            }
        };

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            // SDP offerをUIに表示
            myPeerIdEl.textContent = JSON.stringify(peerConnection.localDescription);
            window.logMessage('ホストのSDP offerをテキストボックスに表示しました。コピーしてクライアントに渡してください。', 'success');

        } catch (error) {
            console.error('Offer作成エラー:', error);
            window.logMessage('Offer作成中にエラーが発生しました。', 'error');
        }
    });

    connectToRoomButton.addEventListener('click', async () => {
        const offerSdpText = peerIdInput.value;
        if (!offerSdpText) {
            window.logMessage('SDP offerを貼り付けてください。', 'error');
            return;
        }

        window.logMessage('PeerConnectionのセットアップを開始します...', 'info');
        setupPeerConnection();

        // 接続状態の監視
        peerConnection.onconnectionstatechange = () => {
            console.log('PeerConnection State:', peerConnection.connectionState);
            connectionStatusEl.textContent = `接続状態: ${peerConnection.connectionState}`;
            if (peerConnection.connectionState === 'connected') {
                window.logMessage('✅ プレイヤーが接続しました！', 'success');
                onlinePartyGoButton.classList.remove('hidden');
                if (goButton) {
                    goButton.disabled = false;
                }
            } else if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
                window.logMessage('接続が切断されました。', 'error');
                cleanupConnection();
            }
        };

        try {
            const offerSdp = JSON.parse(offerSdpText);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offerSdp));
            window.logMessage(`RemoteDescriptionを設定しました (offer)`, 'info');

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            // SDP answerをUIに表示
            myPeerIdEl.textContent = JSON.stringify(peerConnection.localDescription);
            window.logMessage('クライアントのSDP answerをテキストボックスに表示しました。これをホストに渡してください。', 'success');

        } catch (error) {
            console.error('Answer作成エラー:', error);
            window.logMessage('Answer作成中にエラーが発生しました。', 'error');
        }
    });

    // パーティー編成に進むボタンのイベントリスナー
    onlinePartyGoButton.addEventListener('click', () => {
        window.initializePlayerParty(['char-a', 'char-b', 'char-c']);
        window.handleOpponentParty(['char-d', 'char-e', 'char-f']);
        document.getElementById('online-screen').classList.add('hidden');
        document.getElementById('party-screen').classList.remove('hidden');
        document.getElementById('go-button').disabled = false;
        window.logMessage('パーティー編成画面に移動しました。', 'success');
    });

});

// PeerConnectionのセットアップ
function setupPeerConnection() {
    console.log("PeerConnectionのセットアップを開始します。");
    peerConnection = new RTCPeerConnection({
        iceServers: STUN_SERVERS
    });
    console.log("PeerConnectionが初期化されました。");

    // ICE候補が利用可能になったら、コンソールに表示
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('ICE候補を送信:', event.candidate);
        } else {
            console.log('ICE候補収集完了');
        }
    };
    
    // データチャネルの受信
    if (!isHost) {
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            handleChannelStatusChange();
            dataChannel.onmessage = handleDataChannelMessage;
        };
    } else {
        dataChannel = peerConnection.createDataChannel("game-data");
        handleChannelStatusChange();
    }
}

// データチャネルの状態が変化したときの処理
function handleChannelStatusChange() {
    if (dataChannel) {
        dataChannel.onopen = () => {
            window.logMessage('データチャネルが開かれました。', 'success');
        };
        dataChannel.onclose = () => {
            window.logMessage('データチャネルが閉じられました。', 'error');
        };
        dataChannel.onerror = (error) => {
            console.error('データチャネルエラー:', error);
            window.logMessage('データチャネルでエラーが発生しました。', 'error');
        };
    }
}

// データチャネルでメッセージを受信したときの処理
function handleDataChannelMessage(event) {
    if (isOnlineMode && !isHost) {
        const message = JSON.parse(event.data);
        const { eventType, eventData } = message;

        if (eventType === 'sync_party') {
            window.handleOpponentParty(eventData);
        } else if (eventType === 'start_battle') {
            window.startBattleWithOpponentParty(eventData.enemies);
        } else if (eventType === 'execute_action') {
            window.executeAction(eventData);
        } else if (eventType === 'sync_game_state') {
            window.syncGameStateClientSide(eventData);
        } else if (eventType === 'log_message') {
            window.logMessage(eventData.message, 'from-host');
        }
    }
}

// 接続のクリーンアップ関数
function cleanupConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    isOnlineMode = false;

    if (onlinePartyGoButton) {
        onlinePartyGoButton.classList.add('hidden');
    }
    if (myPeerIdEl) {
        myPeerIdEl.textContent = '';
    }
    if (connectionStatusEl) {
        connectionStatusEl.textContent = '';
    }
    if (peerIdInput) {
        peerIdInput.value = '';
    }
    if (goButton) {
        goButton.disabled = true;
    }
}

// 送信関数
window.sendData = function (eventType, data) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
        window.logMessage('データチャネルが開かれていません。データを送信できません。', 'error');
        return;
    }
    dataChannel.send(JSON.stringify({ eventType, eventData: data }));
};