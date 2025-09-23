// main.js (最終修正版)

// SkyWay SDKはグローバル変数として読み込まれることを想定
const SkyWayContext = window.skyway_room?.SkyWayContext;
const SkyWayRoom = window.skyway_room?.SkyWayRoom;
const SkyWayStreamFactory = window.skyway_room?.SkyWayStreamFactory;

let context = null;
let room = null;
let localPerson = null;
let dataStream = null;
let isHost = false;
let isOnlineMode = false;

// データストリームの準備ができたことを解決するPromise
let resolveDataStreamReady = null;
let dataStreamReadyPromise = new Promise(resolve => {
    resolveDataStreamReady = resolve;
});

// UUID v4を生成する関数 (SkyWayで使用)
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
    const onlineButton = document.getElementById('online-button');
    const backButton = document.getElementById('back-button');
    const startAdventureButton = document.getElementById('go-button');
    const connectButton = document.getElementById('connect-button');
    const copyIdButton = document.getElementById('copy-id-button');
    const backToTitleButton = document.getElementById('back-to-title-button');
    const onlinePartyGoButton = document.getElementById('online-party-go-button');

    const titleScreen = document.getElementById('title-screen');
    const onlineScreen = document.getElementById('online-screen');
    const partyScreen = document.getElementById('party-screen');
    const battleScreen = document.getElementById('battle-screen');

    const myPeerIdEl = document.getElementById('my-peer-id');
    const peerIdInput = document.getElementById('peer-id-input');
    const connectionStatusEl = document.getElementById('connection-status');

    // === イベントリスナー ===

    startButton.addEventListener('click', () => {
        isOnlineMode = false;
        titleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        window.initializePartyScreen(); // パーティー画面の初期化
    });

    onlineButton.addEventListener('click', async () => {
        isOnlineMode = true;
        titleScreen.classList.add('hidden');
        onlineScreen.classList.remove('hidden');

        // ホストとしてのUI設定
        myPeerIdEl.textContent = 'IDを生成中...';
        peerIdInput.disabled = true;
        connectButton.disabled = true;
        copyIdButton.disabled = true;

        try {
            await initializeSkyWay();
            isHost = true;
            const roomId = generateUuidV4();
            await joinSkyWayRoom(roomId);
            myPeerIdEl.textContent = roomId;
            copyIdButton.disabled = false;
            connectionStatusEl.textContent = '相手の参加を待っています...';
            console.log("ホストとして接続完了");
        } catch (error) {
            connectionStatusEl.textContent = '接続に失敗しました。ページを再読み込みしてください。';
            console.error('ホスト接続エラー:', error);
            cleanupSkyWay();
        }
    });

    backButton.addEventListener('click', () => {
        partyScreen.classList.add('hidden');
        if (isOnlineMode) {
            onlineScreen.classList.remove('hidden');
        } else {
            titleScreen.classList.remove('hidden');
        }
    });

    backToTitleButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        cleanupSkyWay();
    });

    startAdventureButton.addEventListener('click', () => {
        const selectedParty = window.getSelectedParty();
        if (selectedParty && selectedParty.length > 0) {
            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');
            if (isOnlineMode) {
                window.initializePlayerParty(selectedParty);
                window.checkBothPartiesReady();
            } else {
                window.startBattle(selectedParty);
            }
        } else {
            window.logMessage('パーティーメンバーを1人以上選択してください。', 'error');
        }
    });

    connectButton.addEventListener('click', async () => {
        const roomId = peerIdInput.value;
        if (roomId) {
            isHost = false;
            connectButton.disabled = true;
            peerIdInput.disabled = true;
            connectionStatusEl.textContent = '接続中...';
            try {
                await initializeSkyWay();
                await joinSkyWayRoom(roomId);
                myPeerIdEl.textContent = '接続済み';
                connectionStatusEl.textContent = 'ルームに参加しました。';
                onlinePartyGoButton.classList.remove('hidden');
                console.log("クライアントとして接続完了");
            } catch (error) {
                connectionStatusEl.textContent = 'ルームへの参加に失敗しました。';
                console.error('クライアント接続エラー:', error);
                cleanupSkyWay();
            }
        } else {
            connectionStatusEl.textContent = '相手のIDを入力してください。';
        }
    });

    copyIdButton.addEventListener('click', () => {
        if (myPeerIdEl.textContent) {
            navigator.clipboard.writeText(myPeerIdEl.textContent)
                .then(() => {
                    connectionStatusEl.textContent = 'IDをコピーしました！';
                })
                .catch(err => {
                    console.error('IDのコピーに失敗しました:', err);
                    connectionStatusEl.textContent = 'IDのコピーに失敗しました。';
                });
        }
    });

    onlinePartyGoButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        window.initializePartyScreen(); // パーティー画面の初期化
    });

    // === SkyWay関連の関数 ===
    async function initializeSkyWay() {
        if (context) return;

        // SkyWay SDKが正しく読み込まれたか確認
        if (!SkyWayContext || !SkyWayRoom || !SkyWayStreamFactory) {
            console.error("SkyWay SDKが正しく読み込まれていません。index.htmlの<script>タグを確認してください。");
            throw new Error("SkyWay SDK is not loaded.");
        }

        try {
            const res = await fetch('https://command-battle-online2-8j5m.vercel.app/api/token');
            const { token } = await res.json();
            context = await SkyWayContext.Create(token);
            console.log("SkyWay Context created.");
        } catch (error) {
            console.error('SkyWay接続エラー:', error);
            throw error;
        }
    }

    async function joinSkyWayRoom(roomId) {
        if (!context) {
            console.error("SkyWay Context is not initialized.");
            throw new Error("SkyWay Context is not initialized.");
        }

        try {
            room = await SkyWayRoom.FindOrCreate(context, {
                name: roomId,
                type: 'sfu'
            });

            // roomオブジェクトが正常に作成されたか確認する
            if (!room) {
                throw new Error("Failed to create or find SkyWay room.");
            }

            // イベントリスナーをjoin()呼び出しの前に設定する
            room.onStreamSubscribed?.add((e) => {
                if (e.stream.contentType === 'data') {
                    dataStream = e.stream;
                    dataStream.onData.add((message) => {
                        const data = JSON.parse(new TextDecoder().decode(message));
                        console.log("Received data:", data);
                        window.handleBattleAction(data);
                    });
                    console.log("Data stream subscribed.");
                    resolveDataStreamReady();
                }
            });

            room.onPersonJoined?.add((e) => {
                const isPeerJoined = room.getPersons().length === 2;
                if (isPeerJoined) {
                    connectionStatusEl.textContent = '相手が参加しました！';
                    onlinePartyGoButton.classList.remove('hidden');
                }
            });

            localPerson = await room.join();

            const localDataStream = await SkyWayStreamFactory.CreateDataStream();
            await localPerson.publish(localDataStream);
            dataStream = localDataStream;
            console.log("Data stream published.");
            resolveDataStreamReady();
        } catch (error) {
            console.error('ルーム参加エラー:', error);
            throw error;
        }
    }

    window.cleanupSkyWay = function () {
        try {
            if (localPerson) localPerson.leave();
            if (room) room.close();
            if (context) context.dispose();
        } catch (err) {
            console.warn("⚠️ cleanupSkyWay エラー (無視してOK):", err);
        } finally {
            localPerson = null; room = null; context = null; dataStream = null;
            isHost = false; isOnlineMode = false;
            onlinePartyGoButton.classList.add('hidden');
            myPeerIdEl.textContent = '';
            connectionStatusEl.textContent = '';
            peerIdInput.value = '';
            connectButton.disabled = false;
            peerIdInput.disabled = false;
            copyIdButton.disabled = true;

            resolveDataStreamReady = null;
            dataStreamReadyPromise = new Promise(resolve => {
                resolveDataStreamReady = resolve;
            });
            console.log("✅ cleanupSkyWay 完了");
        }
    }

    window.sendData = async function (data) {
        if (data === undefined || data === null || Object.keys(data).length === 0) {
            console.warn('送信するデータが無効です (データが空です)。送信を中断します。', data);
            return false;
        }
        if (!dataStream) {
            console.warn('データストリームがまだ準備できていません。準備を待機します...');
            await dataStreamReadyPromise;
        }
        try {
            const serializedData = JSON.stringify(data);
            dataStream.write(serializedData);
            console.log('Sent data:', serializedData);
            return true;
        } catch (error) {
            console.error('データ送信に失敗しました:', error);
            return false;
        }
    };

    window.isOnlineMode = function () {
        return isOnlineMode;
    };

    window.isHost = function () {
        return isHost;
    };
});