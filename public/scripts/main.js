// main.js (Pusher版)

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
// ここにあなたのPusher App KeyとClusterを直接入力します
const PUSHER_APP_KEY = 'a2fd55b8bc4f266ae242'; 
const PUSHER_CLUSTER = 'ap3'; 

const pusher = new Pusher(PUSHER_APP_KEY, {
    cluster: PUSHER_CLUSTER,
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
    // === UI要素の取得 ===
    const startButton = document.getElementById('start-button');
    const backButton = document.getElementById('back-button');
    const goButton = document.getElementById('go-button');
    const onlineButton = document.getElementById('online-button');
    const backToTitleButton = document.getElementById('back-to-title-button');
    const showHostUiButton = document.getElementById('show-host-ui-button');
    const showClientUiButton = document.getElementById('show-client-ui-button');

    const createRoomButton = document.getElementById('create-room-button'); // 新しく追加
    const joinRoomButton = document.getElementById('join-room-button'); // 新しく追加

    const copyIdButton = document.getElementById('copy-id-button');
    const onlinePartyGoButton = document.createElement('button');
    const peerIdInput = document.getElementById('peer-id-input');
    const myPeerIdEl = document.getElementById('my-peer-id');
    const connectionStatusEl = document.getElementById('connection-status');

    const titleScreen = document.getElementById('title-screen');
    const partyScreen = document.getElementById('party-screen');
    const battleScreen = document.getElementById('battle-screen');
    const onlineScreen = document.getElementById('online-screen');
    const modeSelection = document.getElementById('mode-selection');
    const hostUi = document.getElementById('host-ui');
    const clientUi = document.getElementById('client-ui');

    onlinePartyGoButton.id = 'online-party-go-button';
    onlinePartyGoButton.textContent = 'パーティー編成へ';
    onlinePartyGoButton.className = 'proceed-button hidden';
    document.querySelector('.online-controls').appendChild(onlinePartyGoButton);


    // === イベントリスナー ===

    startButton.addEventListener('click', () => {
        isOnlineMode = false;
        titleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
    });

    onlineButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        onlineScreen.classList.remove('hidden');
        modeSelection.classList.remove('hidden');
        hostUi.classList.add('hidden');
        clientUi.classList.add('hidden');
        connectionStatusEl.textContent = 'モードを選択してください';
        cleanupWebRTC();
    });

    backButton.addEventListener('click', () => {
        partyScreen.classList.add('hidden');
        if (isOnlineMode) {
            onlineScreen.classList.remove('hidden');
        } else {
            titleScreen.classList.remove('hidden');
        }
    });

    showHostUiButton.addEventListener('click', () => {
        modeSelection.classList.add('hidden');
        hostUi.classList.remove('hidden');
    });

    showClientUiButton.addEventListener('click', () => {
        modeSelection.classList.add('hidden');
        clientUi.classList.remove('hidden');
        connectionStatusEl.textContent = '相手のルームIDを入力してください';
    });
    
    backToTitleButton.addEventListener('click', async () => {
        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        await cleanupWebRTC();
    });

    createRoomButton.addEventListener('click', async () => {
        const peerId = generateUuidV4();
        myPeerIdEl.textContent = peerId;
        window.logMessage('ルームを作成しました。IDを相手に伝えてください。', 'success');
        copyIdButton.disabled = false;
        createRoomButton.disabled = true;
        
        await connectToPeer(true, peerId);
    });

    joinRoomButton.addEventListener('click', async () => {
        const peerId = peerIdInput.value.trim();
        if (peerId) {
            myPeerIdEl.textContent = '接続中...';
            peerIdInput.value = '';
            joinRoomButton.disabled = true;
            createRoomButton.disabled = true;

            await connectToPeer(false, peerId);
        } else {
            window.logMessage('ルームIDを入力してください。', 'error');
        }
    });

    goButton.addEventListener('click', async () => {
        const selectedParty = window.getSelectedParty();
        if (!selectedParty || selectedParty.length < 4) {
            window.logMessage('パーティーメンバーを4人選択してください。', 'error');
            return;
        }

        if (isOnlineMode) {
            window.initializePlayerParty(selectedParty);

            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');

            await dataChannelReadyPromise;
            
            const partyToSend = window.getPlayerParty();
            if (!partyToSend) {
                console.error('パーティー情報が見つかりません。');
                return;
            }

            // オンライン送信用に不要な関数などを削除
            const partyDataForSend = JSON.parse(JSON.stringify(partyToSend));
            partyDataForSend.forEach(member => {
                if (member.passive) delete member.passive.desc;
                if (member.active) member.active.forEach(skill => delete skill.desc);
                if (member.special) delete member.special.desc;
            });

            const sent = await window.sendData({ type: 'party_ready', party: partyDataForSend });
            if (sent) {
                console.log('パーティー情報送信完了');
                window.logMessage('パーティー情報を送信しました。相手の準備を待っています...');
            } else {
                console.error('パーティー情報の送信に失敗しました。');
                window.logMessage('パーティー情報の送信に失敗しました。', 'error');
            }
        } else {
            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');
            window.startBattle(selectedParty);
        }
    });

    copyIdButton.addEventListener('click', () => {
        const roomId = myPeerIdEl.textContent;
        if (roomId) {
            navigator.clipboard.writeText(roomId)
                .then(() => alert('IDがクリップボードにコピーされました！'))
                .catch(err => console.error('コピーに失敗しました', err));
        }
    });

    onlinePartyGoButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        goButton.disabled = false;
    });

    // === WebRTCネイティブの接続処理 ===
    async function connectToPeer(isCreator, peerId) {
        if (isOnlineMode) return;
        isOnlineMode = true;
        isHost = isCreator;

        window.logMessage('接続を開始します...', 'info');
        connectionStatusEl.textContent = '接続中...';

        const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
        const rtcConfig = { iceServers: iceServers };

        peerConnection = new RTCPeerConnection(rtcConfig);

        // ★★★ Pusherによるシグナリングのセットアップ ★★★
        const channel = pusher.subscribe(`private-${peerId}`);
        connectionStatusEl.textContent = 'シグナリングチャンネルに接続中...';

        // シグナリングサーバーからのメッセージ受信ハンドラ
        channel.bind('client-signal', async (data) => {
            if (data.type === 'offer' && !isHost) {
                // クライアント側: オファーを受信し、アンサーを返す
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                // アンサーを送信
                channel.trigger('client-signal', { type: 'answer', sdp: peerConnection.localDescription });
                connectionStatusEl.textContent = `接続完了！`;
                onlinePartyGoButton.classList.remove('hidden');
            } else if (data.type === 'answer' && isHost) {
                // ホスト側: アンサーを受信
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                connectionStatusEl.textContent = `接続完了！`;
                onlinePartyGoButton.classList.remove('hidden');
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
        
        // データチャネルのセットアップ
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
                if (data.type === 'party_ready') {
                    console.log('相手のパーティー情報を受信:', data.party);
                    window.logMessage('対戦相手のパーティー情報を受信しました。');
                    window.handleOpponentParty(data.party);
                    window.checkBothPartiesReady();
                } else if (data.type === 'log_message') {
                    window.logMessage(data.message, data.messageType);
                } else if (data.type === 'execute_action') {
                    window.executeAction(data);
                } else if (data.type === 'sync_game_state') {
                    window.handleBattleAction(data);
                } else if (data.type === 'battle_end') {
                    window.handleBattleAction(data);
                } else if (data.type === 'start_battle') {
                    window.handleBattleAction(data);
                }
            } catch (error) {
                console.error('受信データの解析または処理に失敗しました:', error);
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
        onlinePartyGoButton.classList.add('hidden');
        myPeerIdEl.textContent = '';
        connectionStatusEl.textContent = '';
        peerIdInput.value = '';
        goButton.disabled = false;
        if (createRoomButton) createRoomButton.disabled = false;
        if (joinRoomButton) joinRoomButton.disabled = false;

        // Promiseをリセット
        resolveDataChannelReady = null;
        dataChannelReadyPromise = new Promise(resolve => {
            resolveDataChannelReady = resolve;
        });

        console.log("✅ WebRTCクリーンアップ完了");
    }

    window.sendData = async function (data) {
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
});