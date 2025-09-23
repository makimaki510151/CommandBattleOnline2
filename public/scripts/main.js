// main.js (トークン使用版)

// SkyWay SDKはグローバル変数として読み込まれることを想定
const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = window.skyway_room;

let context = null;
let room = null;
let localPerson = null;
let dataStream = null;
let isHost = false;
let isOnlineMode = false;

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

    goButton.addEventListener('click', () => {
        const selectedParty = window.getSelectedParty();
        if (selectedParty.length < 1) {
            alert('パーティーは1人以上で編成してください。');
            return;
        }

        if (isOnlineMode) {
            window.sendData({ type: 'party_ready', party: selectedParty });
            logMessage('パーティーを決定し、相手の準備を待っています...');
            goButton.disabled = true; // 連続クリック防止
        } else {
            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');
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

            // ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
            // 修正点：メソッド名を addOnce から once に変更
            room.onMemberJoined.once(async ({ member }) => {
                // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
                connectionStatusEl.textContent = `✅ 相手が接続しました！`;
                onlinePartyGoButton.classList.remove('hidden');
                window.sendData({ type: 'connection_established' });

                const { publication } = await room.waitForPublication({ publisher: member });
                if (publication.contentType === 'data') {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                }
            });

            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);

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

        // --- デバッグ強化 ---
        console.log(`[Client] 接続開始: ルームID [${remoteRoomId}]`);
        connectionStatusEl.textContent = '準備中...';
        connectButton.disabled = true; // 処理中の連続クリックを防止

        try {
            // 1. トークン取得
            console.log("[Client] ステップ1: トークンを取得します...");
            connectionStatusEl.textContent = 'トークンを取得中...';
            const res = await fetch('https://command-battle-online2-8j5m.vercel.app/api/token');
            if (!res.ok) {
                // fetch自体は成功したが、ステータスコードがエラーの場合
                throw new Error(`トークンサーバーエラー: ${res.status}`);
            }
            const { token } = await res.json();
            if (!token) {
                throw new Error('取得したトークンが無効です。');
            }
            console.log("[Client] ステップ1: トークン取得完了。");

            // 2. SkyWayコンテキスト作成
            console.log("[Client] ステップ2: SkyWayコンテキストを作成します...");
            connectionStatusEl.textContent = 'SkyWayを初期化中...';
            context = await SkyWayContext.Create(token);
            console.log("[Client] ステップ2: SkyWayコンテキスト作成完了。");

            // 3. ルーム検索
            console.log(`[Client] ステップ3: ルーム [${remoteRoomId}] を検索します...`);
            connectionStatusEl.textContent = 'ルームを検索中...';
            room = await SkyWayRoom.Find(context, { name: remoteRoomId });
            if (!room) {
                throw new Error('ルームが見つかりませんでした。IDを確認してください。');
            }
            console.log("[Client] ステップ3: ルーム検索完了。");

            // 4. ルーム参加
            console.log("[Client] ステップ4: ルームに参加します...");
            connectionStatusEl.textContent = 'ルームに参加中...';
            localPerson = await room.join();
            console.log("[Client] ステップ4: ルーム参加完了。");

            // 5. データストリームの準備と公開
            console.log("[Client] ステップ5: データストリームを準備・公開します...");
            connectionStatusEl.textContent = 'データ通信を準備中...';
            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);
            console.log("[Client] ステップ5: データストリーム公開完了。");

            // 6. ホストのストリームを購読
            console.log("[Client] ステップ6: ホストのデータストリームを購読します...");
            for (const publication of room.publications) {
                if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                    console.log(`[Client] ホスト (${publication.publisher.id}) のストリームを購読しました。`);
                }
            }

            // 7. 完了
            console.log("[Client] 全ての接続処理が完了しました。");
            connectionStatusEl.textContent = '✅ 接続完了！';
            onlinePartyGoButton.classList.remove('hidden');

        } catch (error) {
            // --- エラーハンドリング強化 ---
            console.error('クライアント接続エラー:', error);
            // ユーザーに分かりやすいエラーメッセージを表示
            connectionStatusEl.textContent = `❌ エラー: ${error.message}`;
            // 失敗したらリソースを解放
            await cleanupSkyWay();
        } finally {
            // --- 処理完了後 ---
            // 成功時はボタンは押せないままで良いが、失敗時は再度押せるようにする
            if (!room) { // roomがnullなら失敗と判断
                connectButton.disabled = false;
            }
        }
    }

    // データストリームの受信ハンドラ
    function handleDataStream(stream) {
        stream.onData.on(async ({ data }) => {
            try {
                const parsedData = JSON.parse(data);
                console.log('Received data:', parsedData);

                if (parsedData.type === 'connection_established') {
                    onlinePartyGoButton.classList.remove('hidden');
                } else if (parsedData.type === 'party_ready') {
                    window.handleOpponentParty(parsedData.party);

                    const myParty = window.getSelectedParty();
                    if (myParty && myParty.length > 0 && goButton.disabled) { // 自分が準備完了かチェック
                        partyScreen.classList.add('hidden');
                        battleScreen.classList.remove('hidden');
                        window.startOnlineBattle();
                    } else {
                        logMessage('相手の準備が完了しました。');
                    }

                } else if (parsedData.type === 'request_action') {
                    window.handleRemoteActionRequest(parsedData.actorUniqueId);
                } else if (parsedData.type === 'execute_action') {
                    window.executeAction(parsedData);
                } else if (parsedData.type === 'action_result') {
                    window.handleActionResult(parsedData.result);
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
            console.log("✅ cleanupSkyWay 完了");
        }
    }

    // データ送信関数
    window.sendData = function (data) {
        if (dataStream && data !== undefined) {
            try {
                const serializedData = JSON.stringify(data);
                dataStream.write(serializedData);
                console.log('Sent data:', serializedData);
            } catch (error) {
                console.error('データ送信に失敗しました:', error);
            }
        } else {
            console.warn('データストリームが利用不可、またはデータが無効です。');
        }
    };

    window.isOnlineMode = () => isOnlineMode;
    window.isHost = () => isHost;
});
