// main.js

// SkyWay SDKのクラスをグローバルから取得
let SkyWayContext, SkyWayRoom;

let room = null;
let me = null;
let dataStream = null;

let isOnlineMode = false;
let isHost = false;

// DOM要素の宣言
let onlinePartyGoButton, connectionStatusEl, onlineScreen, messageLogEl;
let goButton, roomNameInput, joinRoomButton, backToTitleButton;

// ログ表示関数
window.logMessage = (message, type = '') => {
    const p = document.createElement('p');
    p.textContent = message;
    if (type) p.classList.add('log-message', type);
    if (messageLogEl) {
        messageLogEl.appendChild(p);
        messageLogEl.scrollTop = messageLogEl.scrollHeight;
    }
};

// モバイル判定
function isMobileDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android|webOS|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
}

// トークン取得
async function getSkyWayToken() {
    try {
        const res = await fetch('/api/token');
        
        if (!res.ok) {
            const errorDetail = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorDetail.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.token) {
            throw new Error('レスポンスにトークンが含まれていません');
        }
        
        return data;
    } catch (err) {
        console.error('Token fetch error:', err);
        throw new Error(`認証エラー: ${err.message}`);
    }
}

// SkyWay接続メイン処理
async function connectToSkyWay(roomName) {
    try {
        const sw = window.skyway_room;
        if (!sw) throw new Error("SkyWay SDKが読み込まれていません。");
        
        SkyWayContext = sw.SkyWayContext;
        SkyWayRoom = sw.SkyWayRoom;

        if (connectionStatusEl) connectionStatusEl.textContent = '接続中...';
        
        const { token } = await getSkyWayToken();
        const context = await SkyWayContext.Create(token);
        
        room = await SkyWayRoom.FindOrCreate(context, {
            type: 'p2p',
            name: roomName,
        });

        me = await room.join();
        
        // 1人目ならホスト、2人目ならクライアント
        isHost = room.members.length === 1;

        // データ通信用のストリームを作成して公開
        dataStream = await SkyWayContext.CreateDataStream();
        await me.publish(dataStream);

        if (connectionStatusEl) {
            connectionStatusEl.textContent = `ルーム「${roomName}」に接続完了 (${isHost ? 'ホスト' : 'クライアント'})`;
        }

        setupSkyWayEventListeners();
        
        // 接続できたら「パーティー編成へ」ボタンを含むエリアを表示
        document.getElementById('online-setup')?.classList.remove('hidden');
        if (onlinePartyGoButton) onlinePartyGoButton.classList.remove('hidden');

    } catch (err) {
        console.error('SkyWay接続エラー:', err);
        if (connectionStatusEl) connectionStatusEl.textContent = 'エラー: ' + err.message;
    }
}

// 受信イベント設定
function setupSkyWayEventListeners() {
    room.onMemberJoined.add((e) => {
        window.logMessage(`対戦相手が参加しました`, 'status-effect');
    });

    me.onPublicationSubscribed.add(({ stream }) => {
        if (stream.contentType === 'data') {
            stream.onData.add((data) => {
                if (window.handleDataChannelMessage) {
                    window.handleDataChannelMessage(data);
                }
            });
        }
    });
}

// データ送信関数
window.sendData = function (eventType, data) {
    if (dataStream) {
        dataStream.write({ eventType, eventData: data });
    }
};

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    onlinePartyGoButton = document.getElementById('online-party-go-button');
    connectionStatusEl = document.getElementById('connection-status');
    onlineScreen = document.getElementById('online-screen');
    messageLogEl = document.getElementById('message-log');
    goButton = document.getElementById('go-button');
    roomNameInput = document.getElementById('room-name-input');
    joinRoomButton = document.getElementById('join-room-button');
    backToTitleButton = document.getElementById('back-to-title-button');

    // ルーム接続ボタンのクリックハンドラ
    joinRoomButton?.addEventListener('click', () => {
        const roomName = roomNameInput?.value;
        if (!roomName) {
            alert("ルームIDを入力してください");
            return;
        }
        connectToSkyWay(roomName);
    });

    // タイトル画面の「オンライン対戦」ボタン
    document.getElementById('online-button')?.addEventListener('click', () => {
        isOnlineMode = true;
        document.getElementById('title-screen')?.classList.add('hidden');
        onlineScreen?.classList.remove('hidden');
    });

    // タイトルに戻るボタン
    backToTitleButton?.addEventListener('click', () => {
        cleanupConnection();
        onlineScreen?.classList.add('hidden');
        document.getElementById('title-screen')?.classList.remove('hidden');
    });

    // 「バトル開始！（パーティー編成へ）」ボタン
    onlinePartyGoButton?.addEventListener('click', () => {
        if (onlineScreen) onlineScreen.classList.add('hidden');
        document.getElementById('party-screen')?.classList.remove('hidden');
        if (goButton) goButton.disabled = false;
    });

    // パーティー画面の「出かける（GO）」ボタン
    goButton?.addEventListener('click', () => {
        if (!window.getSelectedParty) return;
        const selectedParty = window.getSelectedParty();
        if (selectedParty.length === 0) {
            alert("パーティーを選択してください");
            return;
        }

        document.getElementById('party-screen')?.classList.add('hidden');
        document.getElementById('battle-screen')?.classList.remove('hidden');

        if (isOnlineMode) {
            window.sendData('sync_party', { partyData: selectedParty });
        } else {
            if (window.startBattle) window.startBattle(selectedParty);
        }
    });

    // モバイル警告
    const closeWarningButton = document.getElementById('close-warning-button');
    if (closeWarningButton) {
        closeWarningButton.addEventListener('click', () => {
            document.getElementById('mobile-warning-overlay')?.classList.add('hidden');
        });
    }
    if (isMobileDevice()) {
        document.getElementById('mobile-warning-overlay')?.classList.remove('hidden');
    }
});

// クリーンアップ
function cleanupConnection() {
    if (room) {
        room.leave();
        room = null;
    }
    isOnlineMode = false;
    if (onlinePartyGoButton) onlinePartyGoButton.classList.add('hidden');
    document.getElementById('online-setup')?.classList.add('hidden');
    if (connectionStatusEl) connectionStatusEl.textContent = '';
}

// グローバル公開用
window.isOnlineMode = () => isOnlineMode;
window.isHost = () => isHost;
window.cleanupConnection = cleanupConnection;