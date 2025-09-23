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

    const titleScreen = document.getElementById('title-screen');
    const partyScreen = document.getElementById('party-screen');
    const battleScreen = document.getElementById('battle-screen');
    // 「パーティー編成へ」ボタンをオンライン画面に動的に追加
    const onlinePartyGoButton = document.createElement('button');
    onlinePartyGoButton.id = 'online-party-go-button';
    onlinePartyGoButton.textContent = 'パーティー編成へ';
    onlinePartyGoButton.className = 'proceed-button hidden'; // 最初は隠しておく
    const onlineButton = document.getElementById('online-button');
    const onlineScreen = document.getElementById('online-screen');
    const backToTitleButton = document.getElementById('back-to-title-button');

    // --- オンライン画面内の新UI要素 ---
    const modeSelection = document.getElementById('mode-selection');
    const showHostUiButton = document.getElementById('show-host-ui-button');
    const showClientUiButton = document.getElementById('show-client-ui-button');

    const hostUi = document.getElementById('host-ui');
    const clientUi = document.getElementById('client-ui');

    const myPeerIdEl = document.getElementById('my-peer-id');
    const copyIdButton = document.getElementById('copy-id-button');
    const peerIdInput = document.getElementById('peer-id-input');
    const connectButton = document.getElementById('connect-button');
    const connectionStatusEl = document.getElementById('connection-status');

    document.querySelector('.online-controls').appendChild(onlinePartyGoButton);


    // === イベントリスナー ===

    startButton.addEventListener('click', () => {
        isOnlineMode = false;
        titleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
    });
    // 「オンライン対戦」ボタン -> モード選択画面を表示
    onlineButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        onlineScreen.classList.remove('hidden');

        // UIを初期状態に戻す
        modeSelection.classList.remove('hidden');
        hostUi.classList.add('hidden');
        clientUi.classList.add('hidden');
        connectionStatusEl.textContent = 'モードを選択してください';
        // 以前の接続情報が残らないように必ずクリーンアップ
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

    // 「ホストとして～」ボタン -> ホストUI表示 & 初期化
    showHostUiButton.addEventListener('click', () => {
        modeSelection.classList.add('hidden');
        hostUi.classList.remove('hidden');
        initializeAsHost();
    });

    // 「既存のルームに～」ボタン -> クライアントUI表示
    showClientUiButton.addEventListener('click', () => {
        modeSelection.classList.add('hidden');
        clientUi.classList.remove('hidden');
        connectionStatusEl.textContent = '相手のルームIDを入力してください';
    });

    // 「タイトルに戻る」ボタン
    backToTitleButton.addEventListener('click', async () => {
        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        await cleanupSkyWay(); // 画面を離れる際に必ずクリーンアップ
    });

    goButton.addEventListener('click', async () => { // asyncを追加
        const selectedParty = window.getSelectedParty();
        if (selectedParty.length < 1) {
            alert('パーティーは1人以上で編成してください。');
            return;
        }

        // 先に画面を遷移させる
        partyScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');

        if (isOnlineMode) {
            // 1. 自分のパーティーだけ先に戦闘画面に表示する
            window.initializePlayerParty(selectedParty);

            // 2. データストリームが準備できるまで待機
            logMessage('データストリームの準備を待っています...');
            await dataStreamReadyPromise; // データストリームが確立されるまで待機
            logMessage('データストリームの準備ができました。');

            // 3. 相手に準備完了データを送信
            window.sendData({ type: 'party_ready', party: selectedParty });

            // 4. ログに待機中メッセージを表示
            logMessage('相手の準備を待っています...');
        } else {
            // シングルプレイはそのまま
            window.startBattle(selectedParty);
        }
    });


    connectButton.addEventListener('click', () => {
        const remoteRoomId = peerIdInput.value;
        if (remoteRoomId) {
            connectToRoom(remoteRoomId);
        } else {
            alert('接続先のIDを入力してください。');
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
        goButton.disabled = false; // パーティー編成画面に入るときにボタンを有効化
    });


    // === SkyWay関連の関数 ===

    // ホストとして初期化
    async function initializeAsHost() {
        if (context) return;
        isOnlineMode = true;
        isHost = true;
        connectionStatusEl.textContent = 'トークンを取得中...';
        copyIdButton.disabled = true;

        try {
            // --- トークン取得処理 ---
            const res = await fetch('https://command-battle-online2-8j5m.vercel.app/api/token');
            if (!res.ok) throw new Error(`トークンサーバーからの応答が不正です: ${res.status}`);
            const { token } = await res.json();
            if (!token) throw new Error('トークンの取得に失敗しました。');
            // -----------------------

            connectionStatusEl.textContent = 'ルームを作成中...';
            context = await SkyWayContext.Create(token);

            const roomName = generateUuidV4();
            room = await SkyWayRoom.FindOrCreate(context, {
                type: 'p2p',
                name: roomName,
            });

            localPerson = await room.join();

            myPeerIdEl.textContent = room.name;
            connectionStatusEl.textContent = '相手の接続を待っています...';
            copyIdButton.disabled = false;

            // 相手が参加した時の処理
            room.onMemberJoined.once(async ({ member }) => {
                connectionStatusEl.textContent = `✅ 相手が接続しました！`;
                onlinePartyGoButton.classList.remove('hidden');
                // ホストは自分のデータストリームを公開済みなので、相手に接続確立を通知
                window.sendData({ type: 'connection_established' });
            });

            // 相手がストリームを公開した時の処理
            room.onStreamPublished.add(async ({ publication }) => {
                // 自分のストリームは無視
                if (publication.publisher.id === localPerson.id) return;

                // データストリームでなければ無視
                if (publication.contentType !== 'data') return;

                // 相手のストリームを購読
                const subscription = await localPerson.subscribe(publication.id);
                handleDataStream(subscription.stream);
                console.log(`[Host] クライアント (${publication.publisher.id}) のストリームを購読しました。`);
            });

            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);
            resolveDataStreamReady(); // データストリームの準備ができたことを通知

        } catch (error) {
            console.error('ホスト初期化エラー:', error);
            connectionStatusEl.textContent = `エラー: ${error.message}`;
            await cleanupSkyWay();
        }
    }

    // クライアントとしてルームに接続
    async function connectToRoom(remoteRoomId) {
        if (context) {
            console.warn("既に接続処理が実行中のため、中断します。");
            return;
        }
        isOnlineMode = true;
        isHost = false;

        console.log(`[Client] 接続開始: ルームID [${remoteRoomId}]`);
        connectionStatusEl.textContent = '準備中...';
        connectButton.disabled = true;

        let isSuccess = false;

        try {
            // 1. トークン取得
            console.log("[Client] ステップ1: トークンを取得します...");
            connectionStatusEl.textContent = 'トークンを取得中...';
            const res = await fetch('https://command-battle-online2-8j5m.vercel.app/api/token');
            if (!res.ok) throw new Error(`トークンサーバーエラー: ${res.status}`);
            const { token } = await res.json();
            if (!token) throw new Error('取得したトークンが無効です。');
            console.log("[Client] ステップ1: トークン取得完了。");

            // 2. SkyWayコンテキスト作成
            console.log("[Client] ステップ2: SkyWayコンテキストを作成します...");
            connectionStatusEl.textContent = 'SkyWayを初期化中...';
            context = await SkyWayContext.Create(token);
            console.log("[Client] ステップ2: SkyWayコンテキスト作成完了。");

            // 3. ルーム検索と参加
            console.log(`[Client] ステップ3: ルーム [${remoteRoomId}] に参加します...`);
            connectionStatusEl.textContent = 'ルームに参加中...';

            room = await SkyWayRoom.FindOrCreate(context, {
                type: 'p2p',
                name: remoteRoomId
            });

            console.log("[Client] ステップ3: ルーム参加処理完了。");

            // 4. ルーム参加（join）
            console.log("[Client] ステップ4: メンバーとしてjoinします...");
            localPerson = await room.join();
            console.log("[Client] ステップ4: メンバーとしてjoin完了。");

            // 5. 自分のデータストリームを公開
            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);
            resolveDataStreamReady(); // データストリームの準備ができたことを通知

            // 6. 相手のデータストリームを購読
            room.onStreamPublished.add(async ({ publication }) => {
                if (publication.publisher.id === localPerson.id) return; // 自分のストリームは無視
                if (publication.contentType !== 'data') return; // データストリームでなければ無視

                const subscription = await localPerson.subscribe(publication.id);
                // クライアント側では、ホストからのデータストリームを購読する
                // dataStream変数は自分の公開用、受信はhandleDataStreamに任せる
                handleDataStream(subscription.stream);
                console.log(`[Client] ホスト (${publication.publisher.id}) のストリームを購読しました。`);
            });

            // 7. 完了
            console.log("[Client] 全ての接続処理が完了しました。");
            connectionStatusEl.textContent = '✅ 接続完了！';
            onlinePartyGoButton.classList.remove('hidden');

            isSuccess = true;

        } catch (error) {
            console.error('クライアント接続エラー:', error);
            connectionStatusEl.textContent = `❌ エラー: ${error.message}`;
            await cleanupSkyWay();
        } finally {
            if (!isSuccess) {
                connectButton.disabled = false;
            }
        }
    }


    // データストリームの受信ハンドラ
    function handleDataStream(stream) {
        stream.onData.add(async ({ data }) => {
            try {
                // データがundefinedでないか、空でないかを確認
                if (!data || data === 'undefined') {
                    console.error('無効なデータが受信されました: ', data);
                    return;
                }

                // データが有効なJSON形式かを確認
                const parsedData = JSON.parse(data);
                console.log('Received data:', parsedData);

                if (parsedData.type === 'connection_established') {
                    onlinePartyGoButton.classList.remove('hidden');
                } else if (parsedData.type === 'party_ready') {
                    // 相手のパーティー情報を battle.js に渡し、相手の準備完了を通知
                    window.handleOpponentParty(parsedData.party);
                    window.setOpponentPartyReady(); // battle.jsに相手の準備完了を通知する関数を呼び出す
                } else if (parsedData.type === 'log_message') {
                    window.logMessage(parsedData.message, parsedData.messageType);
                } else if (parsedData.type === 'execute_action') {
                    window.executeAction(parsedData);
                } else if (parsedData.type === 'action_result') {
                    window.handleActionResult(parsedData);
                } else if (parsedData.type === 'sync_game_state') {
                    window.handleBattleAction(parsedData);
                } else if (parsedData.type === 'battle_end') {
                    window.handleBattleAction(parsedData);
                }
            } catch (error) {
                console.error('受信データの解析または処理に失敗しました:', error);
            }
        });
    }


    // SkyWayリソースのクリーンアップ
    async function cleanupSkyWay() {
        console.log("🧹 cleanupSkyWay 実行");
        try {
            if (localPerson) await localPerson.leave();
            if (room) await room.close();
            if (context) await context.dispose();
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

            // dataStreamReadyPromiseをリセット
            resolveDataStreamReady = null;
            dataStreamReadyPromise = new Promise(resolve => {
                resolveDataStreamReady = resolve;
            });

            console.log("✅ cleanupSkyWay 完了");
        }
    }

    // データ送信関数
    window.sendData = async function (data) {
        // データが無効でないかを確認
        if (data === undefined || data === null) {
            console.warn('送信するデータが無効です:', data);
            return;
        }

        // データストリームが準備できるまで待機
        if (!dataStream) {
            console.warn('データストリームがまだ準備できていません。準備を待機します...');
            await dataStreamReadyPromise;
        }

        try {
            const serializedData = JSON.stringify(data);
            dataStream.write(serializedData);
            console.log('Sent data:', serializedData);
        } catch (error) {
            console.error('データ送信に失敗しました:', error);
        }
    };


    window.isOnlineMode = () => isOnlineMode;
    window.isHost = () => isHost;
});


