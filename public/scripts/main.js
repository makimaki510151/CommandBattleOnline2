// main.js (Socket.io + WebRTC版)

// グローバル変数と定数
const STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.ekiga.net' },
    { urls: 'stun:stun.xten.com' }
];
const SIGNALING_SERVER_URL = 'https://online-battle-signaling-server.onrender.com'; // 末尾のスラッシュを削除

let socket = null;
let peerConnection = null;
let dataChannel = null;
let isOnlineMode = false;
let myRoomId = null;
let isHost = false;

// グローバルスコープでDOM要素を宣言
let onlinePartyGoButton;
let myPeerIdEl;
let connectionStatusEl;
let peerIdInput;
let goButton;

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

    // ホストの場合、ログをクライアントに送信 (ホスト側では二重表示しない)
    if (window.isOnlineMode() && window.isHost() && type !== 'from-host') {
        window.sendData('log_message', { message: message, messageType: type });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements をグローバル変数に代入
    const startButton = document.getElementById('start-button');
    const backButton = document.getElementById('back-button');
    goButton = document.getElementById('go-button');
    const onlineButton = document.getElementById('online-button');
    const backToTitleButton = document.getElementById('back-to-title-button');
    const showHostUiButton = document.getElementById('show-host-ui-button');
    const showClientUiButton = document.getElementById('show-client-ui-button');
    const connectButton = document.getElementById('connect-button');
    const startHostConnectionButton = document.getElementById('start-host-connection-button');
    const copyIdButton = document.getElementById('copy-id-button');
    peerIdInput = document.getElementById('peer-id-input');
    myPeerIdEl = document.getElementById('my-peer-id');
    connectionStatusEl = document.getElementById('connection-status');
    const titleScreen = document.getElementById('title-screen');
    const partyScreen = document.getElementById('party-screen');
    const battleScreen = document.getElementById('battle-screen');
    const onlineScreen = document.getElementById('online-screen');
    const modeSelection = document.getElementById('mode-selection');
    const hostUi = document.getElementById('host-ui');
    const clientUi = document.getElementById('client-ui');

    onlinePartyGoButton = document.createElement('button'); // グローバル変数に代入
    onlinePartyGoButton.id = 'online-party-go-button';
    onlinePartyGoButton.textContent = 'パーティー編成へ';
    onlinePartyGoButton.className = 'proceed-button hidden';
    document.querySelector('.online-controls').appendChild(onlinePartyGoButton);

    // --- イベントリスナー ---

    startButton.addEventListener('click', () => {
        isOnlineMode = false;
        titleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
    });

    onlineButton.addEventListener('click', () => {
        isOnlineMode = true;
        titleScreen.classList.add('hidden');
        onlineScreen.classList.remove('hidden');
        modeSelection.classList.remove('hidden');
        hostUi.classList.add('hidden');
        clientUi.classList.add('hidden');
        connectionStatusEl.textContent = 'モードを選択してください';
        cleanupConnection();
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
        const roomId = Math.random().toString(36).substring(2, 9);
        myRoomId = roomId;
        myPeerIdEl.textContent = myRoomId;
        copyIdButton.disabled = false;
        connectionStatusEl.textContent = 'ルームIDを相手に伝えて、「接続を開始」ボタンを押してください。';
        isHost = true;
        console.log(`showHostUiButtonクリック後: isHostの値: ${isHost}`);
    });

    if (startHostConnectionButton) {
        startHostConnectionButton.addEventListener('click', () => {
            if (myRoomId) {
                connectionStatusEl.textContent = '相手の接続を待っています...';
                console.log(`startHostConnectionButtonクリック時: isHostの値: ${isHost}`);
                connectToSignalingServer(myRoomId);
            } else {
                alert('ルームIDがありません。一度タイトルに戻ってやり直してください。');
            }
        });
    }

    showClientUiButton.addEventListener('click', () => {
        modeSelection.classList.add('hidden');
        clientUi.classList.remove('hidden');
        connectionStatusEl.textContent = '相手のルームIDを入力してください';
        isHost = false;
    });

    backToTitleButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        cleanupConnection();
    });

    goButton.addEventListener('click', () => {
        const selectedParty = window.getSelectedParty();
        if (!selectedParty || selectedParty.length !== 4) {
            window.logMessage('パーティーメンバーを4人選択してください。', 'error');
            return;
        }

        if (isOnlineMode) {
            if (!peerConnection || !dataChannel || dataChannel.readyState !== 'open') {
                window.logMessage('接続が完了していません。接続状態を確認してください。', 'error');
                return;
            }

            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');

            // initializePlayerPartyは、パーティー準備完了を送信する前に呼ぶ
            window.initializePlayerParty(selectedParty);

            // 送信するデータをキャラクターのIDリストに限定
            const partyToSend = selectedParty.map(member => member.originalId);

            if (isHost) {
                window.logMessage('ホストとしてパーティーを準備しました。相手の準備を待っています...', 'info');
                window.sendData('party_ready', { party: partyToSend });
            } else {
                window.logMessage('クライアントとしてパーティーを準備しました。ホストに通知します...', 'info');
                window.sendData('client_party_ready', { party: partyToSend });
            }
        } else {
            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');
            window.startBattle(selectedParty);
        }
    });

    connectButton.addEventListener('click', () => {
        const remoteRoomId = peerIdInput.value;
        if (remoteRoomId && remoteRoomId.length > 0) {
            myRoomId = remoteRoomId;
            connectToSignalingServer(remoteRoomId);
            connectionStatusEl.textContent = '接続中...';
        } else {
            alert('接続先のIDを入力してください。');
        }
    });

    copyIdButton.addEventListener('click', () => {
        if (myRoomId) {
            navigator.clipboard.writeText(myRoomId)
                .then(() => alert('IDがクリップボードにコピーされました！'))
                .catch(err => console.error('コピーに失敗しました', err));
        }
    });

    onlinePartyGoButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        goButton.disabled = true;
    });
});

// --- WebRTC接続関数群 ---

async function connectToSignalingServer(roomId) {
    cleanupConnection(); // 既存の接続をクリーンアップ
    socket = io(SIGNALING_SERVER_URL);

    socket.on('connect_error', (err) => {
        console.error('シグナリングサーバー接続エラー:', err);
        window.logMessage('シグナリングサーバーへの接続に失敗しました。', 'error');
        cleanupConnection();
    });

    socket.on('connect', () => {
        console.log('シグナリングサーバー接続成功');
        socket.emit('joinRoom', roomId);
        console.log(`ルーム ${roomId} に参加リクエストを送信しました。`);
        window.logMessage(`ルーム ${roomId} に参加リクエストを送信しました。`, 'info');
        window.logMessage('シグナリングサーバーに接続しました。');

        // ホストの場合はここでPeerConnectionのセットアップを開始
        console.log(`connectToSignalingServer内のsocket.on('connect')時: isHostの値: ${isHost}`);
        if (isHost) {
            console.log("ホストとしてPeerConnectionのセットアップを開始します。");
            setupPeerConnection();
            console.log("setupPeerConnection()が呼び出されました。");
        } else {
            console.log("クライアントモードのため、PeerConnectionのセットアップはシグナル受信時に行われます。");
        }
    });

    socket.on('signal', async (data) => {
        console.log('シグナル受信:', data);
        window.logMessage(`シグナル受信: ${JSON.stringify(data)}`, 'info');

        try {
            if (data.sdp) {
                // offerシグナルを受信した場合の処理
                if (data.sdp.type === 'offer' && !isHost) {
                    // peerConnectionがまだ存在しない場合のみセットアップ
                    if (!peerConnection) {
                        console.log("クライアントとしてPeerConnectionのセットアップを開始します。");
                        setupPeerConnection();
                        console.log("setupPeerConnection()が呼び出されました。(クライアント側)");

                        // 接続状態の監視は一度だけセットアップ
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
                    }

                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    window.logMessage(`RemoteDescriptionを設定しました (${data.sdp.type})`, 'info');

                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    socket.emit('signal', { roomId: myRoomId, sdp: peerConnection.localDescription });
                    window.logMessage('Answerを作成し、送信しました。', 'info');

                    // answerシグナルを受信した場合の処理
                } else if (data.sdp.type === 'answer' && isHost) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    window.logMessage('Answerを受信し、RemoteDescriptionを設定しました。', 'info');
                }
            } else if (data.candidate) {
                // ICE候補を受信した場合の処理
                if (peerConnection) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                    window.logMessage('ICE候補を追加しました。', 'info');
                } else {
                    console.warn("PeerConnectionが初期化されていないため、ICE候補をスキップしました。");
                }
            }
        } catch (e) {
            console.error('シグナル処理中にエラーが発生しました:', e);
        }
    });
}

function setupPeerConnection() {
    console.log("PeerConnectionのセットアップを開始します。");
    peerConnection = new RTCPeerConnection({
        iceServers: STUN_SERVERS
    });
    console.log("PeerConnectionが初期化されました。");

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('ICE候補を送信:', event.candidate);
            socket.emit('signal', {
                roomId: myRoomId,
                candidate: event.candidate
            });
        } else {
            console.log('ICE候補収集完了');
        }
    };

    if (isHost) {
        dataChannel = peerConnection.createDataChannel('game-data');
        setupDataChannelEvents(dataChannel);

        peerConnection.onnegotiationneeded = async () => {
            try {
                const offer = await peerConnection.createOffer()
                    .then(offer => peerConnection.setLocalDescription(offer))
                    .then(() => {
                        console.log('Offerを作成し、LocalDescriptionに設定しました。');
                        socket.emit('signal', {
                            roomId: myRoomId,
                            sdp: peerConnection.localDescription
                        });
                    })
                    .catch(error => {
                        console.error('Offer作成エラー:', error);
                    });
                await peerConnection.setLocalDescription(offer);
                window.logMessage('Offerを作成し、LocalDescriptionに設定しました。', 'info');
                socket.emit('signal', { roomId: myRoomId, sdp: peerConnection.localDescription });
            } catch (e) {
                console.error('Offer作成エラー:', e);
            }
        };
    } else {
        peerConnection.ondatachannel = (event) => {
            console.log('データチャネルを受信');
            dataChannel = event.channel;
            if (dataChannel) {
                setupDataChannelEvents(dataChannel);
            }
        };
    }

    // 接続状態の変化を監視
    peerConnection.onconnectionstatechange = (event) => {
        console.log('PeerConnection State (event):', event);
        console.log('PeerConnection State:', peerConnection.connectionState);
        window.logMessage(`WebRTC接続状態: ${peerConnection.connectionState}`, 'info');
        connectionStatusEl.textContent = `接続状態: ${peerConnection.connectionState}`;
        if (peerConnection.connectionState === 'connected') {
            window.logMessage('✅ プレイヤーが接続しました！', 'success');
            onlinePartyGoButton.classList.remove('hidden');
            // 接続成功時にgoButtonも有効にする
            if (goButton) {
                goButton.disabled = false;
            }
        } else if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
            window.logMessage('接続が切断されました。', 'error');
            cleanupConnection();
        }
    };
}

function setupDataChannelEvents(channel) {
    channel.onopen = () => {
        console.log('データチャネルがオープンしました');
        window.logMessage('データチャネルがオープンしました！', 'success');
    };
    channel.onclose = () => {
        console.log('データチャネルがクローズしました');
    };
    channel.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('データ受信:', data);
        handleReceivedData(data);
    };
    channel.onerror = (error) => {
        console.error('データチャネルエラー:', error);
    };
}

// データ受信を処理する関数
function handleReceivedData(data) {
    const eventType = data.eventType;
    const eventData = data.data;

    // ホストとクライアントでイベントを振り分ける
    if (isHost) {
        if (eventType === 'client_party_ready') {
            window.logMessage('クライアントが準備完了しました。', 'info');
            const clientParty = window.createPartyFromIds(eventData.party);
            const hostParty = window.getPlayerParty();
            // Note: window.startOnlineBattle関数は存在しないため、直接ホスト側の開始関数を呼び出す
            const initialState = {
                playerParty: hostParty,
                opponentParty: clientParty,
                currentTurn: 0,
                isBattleOngoing: true
            };
            window.sendData('start_battle', { initialState: initialState });
            window.startOnlineBattleHostSide();
        } else if (eventType === 'log_message') {
            window.logMessage(eventData.message, eventData.messageType);
        }
    } else { // クライアント
        if (eventType === 'party_ready') {
            window.handleOpponentParty(eventData.party);
            window.logMessage('ホストが準備完了しました。', 'info');
        } else if (eventType === 'start_battle') {
            window.startOnlineBattleClientSide(eventData.initialState);
        } else if (eventType === 'request_action') {
            window.handleActionRequest(eventData);
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
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    isOnlineMode = false;
    myRoomId = null;

    // nullチェックを追加
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
        return false;
    }
    try {
        dataChannel.send(JSON.stringify({ eventType, data }));
        return true;
    } catch (error) {
        console.error('データ送信エラー:', error);
        return false;
    }
};

window.syncGameStateClientSide = (data) => {
    window.syncState(data.playerParty, data.opponentParty);
};

