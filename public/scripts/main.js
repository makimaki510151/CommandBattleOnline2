// main.js (修正版)

// SkyWay SDKはグローバル変数として読み込まれることを想定
const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = window.skyway_room;

let context = null;
let room = null;
let localPerson = null;
let dataStream = null;
let isHost = false;
let isOnlineMode = false;

// データストリームの準備ができたことを解決するPromise
// cleanupSkyWayでリセットされるように、グローバルスコープで定義
let resolveDataStreamReady = null;
let dataStreamReadyPromise = new Promise(resolve => {
    resolveDataStreamReady = resolve;
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
    const connectButton = document.getElementById('connect-button');
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
        cleanupSkyWay();
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
        initializeAsHost();
    });

    showClientUiButton.addEventListener('click', () => {
        modeSelection.classList.add('hidden');
        clientUi.classList.remove('hidden');
        connectionStatusEl.textContent = '相手のルームIDを入力してください';
    });

    backToTitleButton.addEventListener('click', async () => {
        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        await cleanupSkyWay();
    });

    goButton.addEventListener('click', async () => {
        const selectedParty = window.getSelectedParty();
        if (!selectedParty) {
            window.logMessage('パーティーメンバーを4人選択してください。', 'error');
            return;
        }

        if (isOnlineMode) {
            window.initializePlayerParty(selectedParty);
            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');

            if (isHost) {
                await new Promise(resolve => {
                    room.onStreamPublished.once(async ({ publication }) => {
                        if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                            const subscription = await localPerson.subscribe(publication.id);
                            handleDataStream(subscription.stream);
                            resolve();
                        }
                    });
                });
            } else {
                window.sendData({ type: 'party_data', party: selectedParty });
                logMessage('相手のパーティー情報を待機中...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } else {
            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');
            window.startBattle(selectedParty);
        }
    });

    onlinePartyGoButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
    });

    peerIdInput.addEventListener('input', () => {
        connectButton.disabled = peerIdInput.value.trim() === '';
    });

    copyIdButton.addEventListener('click', async () => {
        if (myPeerIdEl.textContent) {
            try {
                await navigator.clipboard.writeText(myPeerIdEl.textContent);
                window.logMessage('ルームIDをコピーしました！', 'success');
            } catch (err) {
                window.logMessage('IDのコピーに失敗しました。', 'error');
                console.error('Failed to copy text:', err);
            }
        }
    });

    connectButton.addEventListener('click', () => {
        const targetId = peerIdInput.value.trim();
        if (targetId) {
            joinRoom(targetId);
        }
    });

    // === SkyWay関連の関数 ===

    async function initializeAsHost() {
        isOnlineMode = true;
        isHost = true;
        connectionStatusEl.textContent = 'トークンを取得中...';
        copyIdButton.disabled = true;

        try {
            const res = await fetch('https://command-battle-online2-8j5m.vercel.app/api/token');
            if (!res.ok) throw new Error(`トークンサーバーからの応答が不正です: ${res.status}`);
            const { token } = await res.json();
            if (!token) throw new Error('トークンの取得に失敗しました。');

            connectionStatusEl.textContent = 'ルームを作成中...';
            context = await SkyWayContext.Create(token);

            const roomName = generateUuidV4();
            room = await SkyWayRoom.FindOrCreate(context, {
                name: generateUuidV4(),
                type: 'p2p',
            });
            localPerson = await room.attach();

            myPeerIdEl.textContent = room.name;
            copyIdButton.disabled = false;
            connectionStatusEl.textContent = '相手の接続を待っています...';
            console.log(`ルーム作成完了。ID: ${room.name}`);

            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);
            resolveDataStreamReady();

            room.onPersonJoined.once(async ({ person }) => {
                window.logMessage(`${person.id} が入室しました！`, 'info');
                connectionStatusEl.textContent = `${person.id} が接続しました。`;
                // オンライン対戦を開始するボタンを表示
                onlinePartyGoButton.classList.remove('hidden');
            });

            room.onStreamPublished.once(async ({ publication }) => {
                if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                }
            });

        } catch (error) {
            console.error('ホストとしての初期化に失敗しました:', error);
            window.logMessage('ホストとしての初期化に失敗しました。', 'error');
            cleanupSkyWay();
        }
    }

    async function joinRoom(roomId) {
        isOnlineMode = true;
        isHost = false;

        console.log(`[Client] 接続開始: ルームID [${remoteRoomId}]`);
        connectionStatusEl.textContent = '準備中...';
        connectButton.disabled = true;

        let isSuccess = false;

        try {
            console.log("[Client] ステップ1: トークンを取得します...");
            connectionStatusEl.textContent = 'トークンを取得中...';
            const res = await fetch('https://command-battle-online2-8j5m.vercel.app/api/token');
            if (!res.ok) throw new Error(`トークンサーバーエラー: ${res.status}`);
            const { token } = await res.json();
            if (!token) throw new Error('取得したトークンが無効です。');
            console.log("[Client] ステップ1: トークン取得完了。");

            console.log("[Client] ステップ2: SkyWayコンテキストを作成します...");
            connectionStatusEl.textContent = 'SkyWayを初期化中...';
            context = await SkyWayContext.Create(token);
            console.log("[Client] ステップ2: SkyWayコンテキスト作成完了。");

            console.log(`[Client] ステップ3: ルーム [${remoteRoomId}] に参加します...`);
            connectionStatusEl.textContent = 'ルームに参加中...';

            room = await SkyWayRoom.FindOrCreate(context, {
                type: 'p2p',
                name: remoteRoomId
            });

            console.log("[Client] ステップ3: ルーム参加処理完了。");

            console.log("[Client] ステップ4: メンバーとしてjoinします...");
            localPerson = await room.join();
            console.log("[Client] ステップ4: メンバーとしてjoin完了。");

            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);
            resolveDataStreamReady();

            room.onStreamPublished.once(async ({ publication }) => {
                if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                }
            });

            const existingDataStream = room.publications.find(p => p.contentType === 'data' && p.publisher.id !== localPerson.id);
            if (existingDataStream) {
                const subscription = await localPerson.subscribe(existingDataStream.id);
                handleDataStream(subscription.stream);
            }

        } catch (error) {
            console.error('ルームへの参加に失敗しました:', error);
            window.logMessage('ルームへの参加に失敗しました。', 'error');
            cleanupSkyWay();
        }
    }

    function handleDataStream(stream) {
        stream.onData.add((event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received data:', data);
                // 統一されたアクション処理システム
                if (window.handleBattleAction) {
                    window.handleBattleAction(data);
                } else {
                    console.warn('handleBattleAction is not defined in battle.js');
                }
            } catch (e) {
                console.error('受信したデータのパースに失敗しました。', e);
            }
        });
        stream.onStateChanged.add((state) => {
            console.log(`Data stream state: ${state}`);
        });
        stream.onClosed.add(() => {
            window.logMessage('相手との接続が切断されました。', 'error');
            cleanupSkyWay();
        });
    }

    async function cleanupSkyWay() {
        if (!context) return;
        try {
            if (localPerson) {
                if (dataStream) {
                    const publications = localPerson.publications.filter(p => p.stream === dataStream);
                    for (const pub of publications) {
                        await localPerson.unpublish(pub);
                    }
                    dataStream.destroy();
                }
                await localPerson.detach();
            }
            if (room) {
                await room.close();
            }
            await context.dispose();
        } catch (err) {
            console.warn("⚠️ cleanupSkyWay エラー (無視してOK):", err);
        } finally {
            localPerson = null; room = null; context = null; dataStream = null;
            isHost = false; isOnlineMode = false;
            onlinePartyGoButton.classList.add('hidden');
            myPeerIdEl.textContent = '';
            connectionStatusEl.textContent = '';
            peerIdInput.value = '';
            goButton.disabled = false;

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