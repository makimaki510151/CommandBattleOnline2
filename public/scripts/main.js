// main.js (通信技術を新に、その他を旧に)

// SkyWay SDKはグローバル変数として読み込まれることを想定
const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = window.skyway_room;

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
    // === UI要素の取得 (旧UI要素も含む) ===
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


    // === イベントリスナー (旧版に新版の通信処理を統合) ===

    startButton.addEventListener('click', () => {
        isOnlineMode = false;
        titleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
    });

    onlineButton.addEventListener('click', async () => {
        isOnlineMode = true;
        titleScreen.classList.add('hidden');
        onlineScreen.classList.remove('hidden');
        await initializeSkyWay();
        isHost = true;
        const roomId = generateUuidV4();
        await joinSkyWayRoom(roomId);
        myPeerIdEl.textContent = roomId;
        copyIdButton.disabled = false;
        peerIdInput.disabled = true;
        connectButton.disabled = true;
        connectionStatusEl.textContent = '相手の参加を待っています...';
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
        cleanupSkyWay(); // 新しい通信方式では、タイトルに戻るときに接続をクリーンアップ
    });

    startAdventureButton.addEventListener('click', () => {
        const selectedParty = window.getSelectedParty();
        if (selectedParty && selectedParty.length > 0) {
            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');
            if (isOnlineMode) {
                // オンラインモードでは、パーティーをbattle.jsに渡し、相手を待つ
                window.initializePlayerParty(selectedParty);
                window.checkBothPartiesReady();
            } else {
                // シングルプレイモードでは、戦闘開始
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
            await initializeSkyWay();
            await joinSkyWayRoom(roomId);
            onlinePartyGoButton.classList.remove('hidden');
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
    });


    // === SkyWay関連の関数 (新版から移植) ===
    async function initializeSkyWay() {
        if (context) return;
        connectionStatusEl.textContent = '接続中...';
        try {
            // トークン取得
            const res = await fetch('https://command-battle-online2-8j5m.vercel.app/api/token');
            const { token } = await res.json();
            context = await SkyWayContext.Create(token);
            connectionStatusEl.textContent = 'SkyWayサーバーに接続しました。';
            console.log("SkyWay Context created.");
        } catch (error) {
            connectionStatusEl.textContent = '接続に失敗しました。ページを再読み込みしてください。';
            console.error('SkyWay接続エラー:', error);
            throw error;
        }
    }

    async function joinSkyWayRoom(roomId) {
        if (!context) {
            console.error("SkyWay Context is not initialized.");
            return;
        }

        connectionStatusEl.textContent = 'ルームに参加中...';
        try {
            room = await SkyWayRoom.FindOrCreate(context, {
                name: roomId,
                type: 'sfu'
            });

            room.onStreamSubscribed.add((e) => {
                if (e.stream.contentType === 'data') {
                    dataStream = e.stream;
                    dataStream.onData.add((message) => {
                        const data = JSON.parse(new TextDecoder().decode(message));
                        console.log("Received data:", data);
                        window.handleBattleAction(data); // battle.jsの処理を呼び出す
                    });
                    console.log("Data stream subscribed.");
                    resolveDataStreamReady();
                }
            });

            room.onPersonJoined.add((e) => {
                const isPeerJoined = room.getPersons().length === 2;
                if (isPeerJoined) {
                    connectionStatusEl.textContent = '相手が参加しました！';
                    onlinePartyGoButton.classList.remove('hidden');
                }
            });

            localPerson = await room.join();

            // データストリームをパブリッシュ
            const localDataStream = await SkyWayStreamFactory.CreateDataStream();
            await localPerson.publish(localDataStream);
            dataStream = localDataStream;
            console.log("Data stream published.");
            resolveDataStreamReady();

            connectionStatusEl.textContent = 'ルームに参加しました。';
        } catch (error) {
            connectionStatusEl.textContent = 'ルームへの参加に失敗しました。';
            console.error('ルーム参加エラー:', error);
            cleanupSkyWay();
        }
    }

    window.cleanupSkyWay = function() {
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
            
            // Promiseをリセット
            resolveDataStreamReady = null;
            dataStreamReadyPromise = new Promise(resolve => {
                resolveDataStreamReady = resolve;
            });
            console.log("✅ cleanupSkyWay 完了");
        }
    }

    // データ送信関数をグローバルに公開
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

    // オンラインモード判定をグローバルに公開
    window.isOnlineMode = function () {
        return isOnlineMode;
    };

    // ホスト判定をグローバルに公開
    window.isHost = function () {
        return isHost;
    };
});