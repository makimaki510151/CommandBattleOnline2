const { SkyWayContext, SkyWayRoom } = skyway_room;
let room = null;
let me = null;
let dataStream = null;

let isOnlineMode = false;
let isHost = false;

// グローバルスコープでDOM要素を宣言
let onlinePartyGoButton;
let connectionStatusEl;
let onlineScreen;
let messageLogEl;
let modeSelectionEl;
let showHostUiButton;
let showClientUiButton;
let hostUiEl;
let clientUiEl;
let goButton;

// 戦闘が開始されたかを追跡するフラグ
let isBattleStarted = false;

// グローバルにアクセス可能な変数と関数
window.isOnlineMode = () => isOnlineMode;
window.isHost = () => isHost;

// ログ表示関数をグローバルに公開
window.logMessage = (message, type = '') => {
    const p = document.createElement('p');
    p.textContent = message;
    if (type) {
        p.classList.add('log-message', type);
    }
    if (messageLogEl) {
        messageLogEl.appendChild(p);
        messageLogEl.scrollTop = messageLogEl.scrollHeight;
    }
};

// モバイル判定ロジック（維持）
function isMobileDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android|webOS|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
}

// Cloudflare Pages Functions からトークンを取得する
async function getSkyWayToken() {
    const res = await fetch('/api/token');
    if (!res.ok) throw new Error('トークンの取得に失敗しました');
    return await res.json();
}

// --- SkyWay接続コアロジック ---
async function connectToSkyWay(roomName) {
    try {
        if (connectionStatusEl) connectionStatusEl.textContent = '接続中...';
        
        const { token } = await getSkyWayToken();
        const context = await SkyWayContext.Create(token);
        
        room = await SkyWayRoom.FindOrCreate(context, {
            type: 'p2p',
            name: roomName,
        });

        me = await room.join();
        
        // 自分が最初の一人ならホスト
        isHost = room.members.length === 1;

        // データ送信用ストリームの準備
        dataStream = await SkyWayContext.CreateDataStream();
        await me.publish(dataStream);

        if (connectionStatusEl) {
            connectionStatusEl.textContent = `ルーム「${roomName}」に接続完了 (${isHost ? 'ホスト' : 'クライアント'})`;
        }

        setupSkyWayEventListeners();

        // 接続できたらパーティー編成ボタンを出す
        if (onlinePartyGoButton) {
            onlinePartyGoButton.classList.remove('hidden');
        }

    } catch (err) {
        console.error('SkyWay接続エラー:', err);
        if (connectionStatusEl) connectionStatusEl.textContent = '接続に失敗しました。';
    }
}

function setupSkyWayEventListeners() {
    // 相手が参加したとき
    room.onMemberJoined.add((e) => {
        window.logMessage(`対戦相手が参加しました`, 'status-effect');
    });

    // データ受信時の処理
    me.onPublicationSubscribed.add(({ stream }) => {
        if (stream.contentType === 'data') {
            stream.onData.add((data) => {
                handleDataChannelMessage(data);
            });
        }
    });
}

// --- メッセージ受信ハンドラ（既存ロジックを完全維持） ---
function handleDataChannelMessage(message) {
    const { eventType, eventData } = message;

    if (eventType === 'opponent_party') {
        if (isHost && window.handleOpponentParty) {
            window.handleOpponentParty(eventData.party);
        }
    } else if (eventType === 'sync_party') {
        window.handleOpponentParty(eventData.partyData);
    } else if (eventType === 'start_battle') {
        if (!isHost) {
            window.startOnlineBattleClientSide(eventData.initialState);
        }
    } else if (eventType === 'execute_action') {
        window.executeAction(eventData);
    } else if (eventType === 'sync_game_state') {
        if (!isHost) {
            window.syncGameStateClientSide(eventData);
            if (window.isBattleOver && window.isBattleOver()) {
                window.handleBattleEnd();
            }
        } else if (isHost && window.syncGameStateHostSide) {
            window.syncGameStateHostSide(eventData);
        }
    } else if (eventType === 'log_message') {
        window.logMessage(eventData.message, eventData.type || 'from-host');
    } else if (eventType === 'request_action') {
        if (!isHost) {
            window.handleActionRequest(eventData);
        }
    } else if (eventType === 'return_to_party_screen') {
        if (!isHost && window.returnToPartyScreen) {
            window.returnToPartyScreen();
            cleanupConnection();
        }
    }
}

// 送信関数（既存の window.sendData をSkyWay用にラップ）
window.sendData = function (eventType, data) {
    if (dataStream) {
        dataStream.write({ eventType, eventData: data });
    }
};

// --- 初期化とイベントリスナー ---
document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の紐付け
    onlinePartyGoButton = document.getElementById('online-party-go-button');
    connectionStatusEl = document.getElementById('connection-status');
    onlineScreen = document.getElementById('online-screen');
    messageLogEl = document.getElementById('message-log');
    modeSelectionEl = document.getElementById('mode-selection');
    showHostUiButton = document.getElementById('show-host-ui-button');
    showClientUiButton = document.getElementById('show-client-ui-button');
    hostUiEl = document.getElementById('host-ui');
    clientUiEl = document.getElementById('client-ui');
    goButton = document.getElementById('go-button');

    // モバイル警告（維持）
    const mobileWarningOverlay = document.getElementById('mobile-warning-overlay');
    const closeWarningButton = document.getElementById('close-warning-button');

    if (closeWarningButton) {
        closeWarningButton.addEventListener('click', () => {
            if (mobileWarningOverlay) mobileWarningOverlay.classList.add('hidden');
        });
    }

    if (isMobileDevice() && mobileWarningOverlay) {
        mobileWarningOverlay.classList.remove('hidden');
    }

    // オンラインモード切替
    document.getElementById('online-button')?.addEventListener('click', () => {
        cleanupConnection();
        isOnlineMode = true;
        document.getElementById('title-screen').classList.add('hidden');
        if (onlineScreen) onlineScreen.classList.remove('hidden');
    });

    document.getElementById('back-to-title-button')?.addEventListener('click', () => {
        cleanupConnection();
        isOnlineMode = false;
        if (onlineScreen) onlineScreen.classList.add('hidden');
        document.getElementById('title-screen')?.classList.remove('hidden');
    });

    // ルームID入力による接続（SkyWay方式への変更点）
    const roomJoinHandler = () => {
        const roomName = document.getElementById('room-id-input')?.value;
        if (!roomName) return alert("ルームIDを入力してください");
        
        if (modeSelectionEl) modeSelectionEl.classList.add('hidden');
        connectToSkyWay(roomName);
    };

    // ホスト・クライアントどちらのボタンでもルームID入力後に接続
    showHostUiButton?.addEventListener('click', roomJoinHandler);
    showClientUiButton?.addEventListener('click', roomJoinHandler);

    // パーティー画面へ
    onlinePartyGoButton?.addEventListener('click', () => {
        const playerPartyData = window.getSelectedParty();
        window.initializePlayerParty(playerPartyData);
        if (onlineScreen) onlineScreen.classList.add('hidden');
        document.getElementById('party-screen')?.classList.remove('hidden');
        if (goButton) goButton.disabled = false;
    });

    // 戦闘開始
    goButton?.addEventListener('click', () => {
        const selectedParty = window.getSelectedParty();
        if (selectedParty.length === 0) return;

        document.getElementById('party-screen')?.classList.add('hidden');
        document.getElementById('battle-screen')?.classList.remove('hidden');

        if (window.isOnlineMode()) {
            const myPartyData = window.getSelectedParty();
            window.initializePlayerParty(myPartyData);
            window.sendData('sync_party', { partyData: myPartyData });
        } else {
            window.startBattle(selectedParty);
        }
    });
});

function cleanupConnection() {
    if (room) {
        room.leave();
        room = null;
    }
    isOnlineMode = false;
    if (onlinePartyGoButton) onlinePartyGoButton.classList.add('hidden');
    if (connectionStatusEl) connectionStatusEl.textContent = '';
    if (modeSelectionEl) modeSelectionEl.classList.remove('hidden');
}