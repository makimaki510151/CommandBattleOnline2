// main.js

// 従来のSkyWay SDKのインポートを削除
// const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = window.skyway_room;

// ★★★ WebRTCネイティブ用の変数定義に変更 ★★★
let peerConnection = null;
let dataChannel = null;
let isHost = false;
let isOnlineMode = false;
let resolveDataChannelReady = null;
let dataChannelReadyPromise = new Promise(resolve => {
    resolveDataChannelReady = resolve;
});

// ★★★ Pusherの初期化 ★★★
const PUSHER_APP_KEY = 'a2fd55b8bc4f266ae242'; // 環境変数を指定
const PUSHER_CLUSTER = 'ap3'; // 例: 'ap1'

const pusher = new Pusher(PUSHER_APP_KEY, {
    cluster: PUSHER_CLUSTER,
    // Vercelで作成した認証エンドポイントを指定
    authEndpoint: '/api/pusher-auth',
});

// UUID v4を生成する関数
function generateUuidV4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

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

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const onlineButton = document.getElementById('online-button');
    const titleScreen = document.getElementById('title-screen');
    const onlineScreen = document.getElementById('online-screen');
    const showHostUiButton = document.getElementById('show-host-ui-button');
    const showClientUiButton = document.getElementById('show-client-ui-button');
    const hostUi = document.getElementById('host-ui');
    const clientUi = document.getElementById('client-ui');
    const createRoomButton = document.getElementById('create-room-button');
    const joinRoomButton = document.getElementById('join-room-button');
    const battleScreen = document.getElementById('battle-screen');
    const partyScreen = document.getElementById('party-screen');
    const myPeerIdEl = document.getElementById('my-peer-id');
    const peerIdInput = document.getElementById('peer-id-input');
    const onlinePartyGoButton = document.getElementById('online-party-go-button');

    // イベントリスナー
    startButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        window.initializePlayerParty();
    });

    onlineButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        onlineScreen.classList.remove('hidden');
    });

    showHostUiButton.addEventListener('click', () => {
        document.getElementById('mode-selection').classList.add('hidden');
        hostUi.classList.remove('hidden');
    });

    showClientUiButton.addEventListener('click', () => {
        document.getElementById('mode-selection').classList.add('hidden');
        clientUi.classList.remove('hidden');
    });

    createRoomButton.addEventListener('click', async () => {
        const peerId = generateUuidV4();
        myPeerIdEl.textContent = peerId;
        window.logMessage('ルームを作成しました。IDを相手に伝えてください。', 'success');
        createRoomButton.disabled = true;
        peerIdInput.value = '';
        joinRoomButton.disabled = true;

        await connectToPeer(true, peerId);
    });

    joinRoomButton.addEventListener('click', async () => {
        const peerId = peerIdInput.value.trim();
        if (peerId) {
            myPeerIdEl.textContent = '接続中...';
            peerIdInput.value = '';
            createRoomButton.disabled = true;
            joinRoomButton.disabled = true;

            await connectToPeer(false, peerId);
        } else {
            window.logMessage('ルームIDを入力してください。', 'error');
        }
    });

    onlinePartyGoButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');
        window.startOnlineBattle();
    });
});

// ★★★ WebRTCネイティブの接続処理に変更 ★★★
async function connectToPeer(isCreator, peerId) {
    if (isOnlineMode) {
        return;
    }
    isOnlineMode = true;
    isHost = isCreator;

    window.logMessage('接続を開始します...', 'info');

    const iceServers = [{
        urls: 'stun:stun.l.google.com:19302'
    }];
    const rtcConfig = {
        iceServers: iceServers
    };

    peerConnection = new RTCPeerConnection(rtcConfig);

    // ★★★ Pusherによるシグナリングのセットアップ ★★★
    const channel = pusher.subscribe(`private-${peerId}`);

    // シグナリングサーバーからのメッセージ受信ハンドラ
    channel.bind('client-signal', async (data) => {
        if (data.type === 'offer' && !isHost) {
            // クライアント側: オファーを受信し、アンサーを返す
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            // アンサーを送信
            channel.trigger('client-signal', { type: 'answer', sdp: peerConnection.localDescription });
        } else if (data.type === 'answer' && isHost) {
            // ホスト側: アンサーを受信
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } else if (data.type === 'candidate') {
            // ICE候補を受信
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
                console.error('addIceCandidate failed:', e);
            }
        }
    });

    // ICE候補のイベントハンドラ
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            // ICE候補をPusher経由で送信
            channel.trigger('client-signal', { type: 'candidate', candidate: event.candidate });
        }
    };

    // データチャネルのセットアップ (変更なし)
    if (isHost) {
        dataChannel = peerConnection.createDataChannel('game-data');
        setupDataChannel(dataChannel);
    } else {
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannel(dataChannel);
        };
    }

    // ホスト側: オファーを生成して送信
    if (isHost) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        // オファーを送信
        channel.trigger('client-signal', { type: 'offer', sdp: peerConnection.localDescription });
    }
}

function setupDataChannel(channel) {
    channel.onopen = () => {
        console.log('✅ Data Channel opened!');
        window.logMessage('接続が確立しました。', 'success');
        resolveDataChannelReady();
    };

    channel.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (window.handleBattleAction) {
                window.handleBattleAction(data);
            }
        } catch (error) {
            console.error('受信データの解析に失敗しました:', error);
        }
    };

    channel.onclose = () => {
        console.log('Data Channel closed.');
        window.logMessage('接続が切断されました。', 'error');
        cleanupWebRTC();
    };

    channel.onerror = (error) => {
        console.error('Data Channel error:', error);
    };
}

// 接続をクリーンアップする関数
function cleanupWebRTC() {
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    isHost = false;
    isOnlineMode = false;

    // UIのリセット
    const onlinePartyGoButton = document.getElementById('online-party-go-button');
    const myPeerIdEl = document.getElementById('my-peer-id');
    const peerIdInput = document.getElementById('peer-id-input');
    const createRoomButton = document.getElementById('create-room-button');
    const joinRoomButton = document.getElementById('join-room-button');
    const onlineScreen = document.getElementById('online-screen');
    const titleScreen = document.getElementById('title-screen');
    const battleScreen = document.getElementById('battle-screen');
    const goButton = document.getElementById('go-button');

    onlinePartyGoButton.classList.add('hidden');
    myPeerIdEl.textContent = '';
    peerIdInput.value = '';
    createRoomButton.disabled = false;
    joinRoomButton.disabled = false;
    onlineScreen.classList.add('hidden');
    battleScreen.classList.add('hidden');
    titleScreen.classList.remove('hidden');
    goButton.disabled = false;

    // Promiseをリセット
    resolveDataChannelReady = null;
    dataChannelReadyPromise = new Promise(resolve => {
        resolveDataChannelReady = resolve;
    });

    console.log("✅ WebRTCクリーンアップ完了");
}

// データ送信関数をWebRTC用に変更
window.sendData = async function (data) {
    if (data === undefined || data === null || (typeof data === 'object' && Object.keys(data).length === 0)) {
        console.warn("送信するデータが無効です。送信を中断します。");
        return false;
    }

    if (!dataChannel || dataChannel.readyState !== 'open') {
        console.warn('データチャネルがまだ開いていません。準備を待機します...');
        await dataChannelReadyPromise;
    }

    try {
        const serializedData = JSON.stringify(data);
        dataChannel.send(serializedData);
        console.log('Sent data:', serializedData);
        return true;
    } catch (error) {
        console.error('データ送信に失敗しました:', error);
        return false;
    }
};

window.isOnlineMode = () => isOnlineMode;
window.isHost = () => isHost;

window.connectAsHost = () => {
    connectToPeer(true, generateUuidV4());
};

window.connectAsClient = (peerId) => {
    connectToPeer(false, peerId);
};