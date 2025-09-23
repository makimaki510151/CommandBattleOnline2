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
    const onlineButton = document.getElementById('online-button');
    const backButton = document.getElementById('back-button');
    const goButton = document.getElementById('go-button');
    const connectButton = document.getElementById('connect-button');
    const copyIdButton = document.getElementById('copy-id-button');
    const backToTitleButton = document.getElementById('back-to-title-button');

    const titleScreen = document.getElementById('title-screen');
    const onlineScreen = document.getElementById('online-screen');
    const partyScreen = document.getElementById('party-screen');
    const battleScreen = document.getElementById('battle-screen');

    const myPeerIdEl = document.getElementById('my-peer-id');
    const peerIdInput = document.getElementById('peer-id-input');
    const connectionStatusEl = document.getElementById('connection-status');

    // 「パーティー編成へ」ボタンをオンライン画面に動的に追加
    const onlinePartyGoButton = document.createElement('button');
    onlinePartyGoButton.id = 'online-party-go-button';
    onlinePartyGoButton.textContent = 'パーティー編成へ';
    onlinePartyGoButton.className = 'proceed-button hidden'; // 最初は隠しておく
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
        initializeAsHost();
    });

    backButton.addEventListener('click', () => {
        partyScreen.classList.add('hidden');
        if (isOnlineMode) {
            onlineScreen.classList.remove('hidden');
        } else {
            titleScreen.classList.remove('hidden');
        }
    });

    backToTitleButton.addEventListener('click', async () => {
        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        await cleanupSkyWay();
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
            // 修正点：イベント名を onPersonJoined から onMemberJoined に変更
            room.onMemberJoined.addOnce(async ({ member }) => {
                // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
                connectionStatusEl.textContent = `✅ 相手が接続しました！`;
                onlinePartyGoButton.classList.remove('hidden');
                window.sendData({ type: 'connection_established' });

                // ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
                // 修正点：引数名も person から member に合わせる
                const { publication } = await room.waitForPublication({ publisher: member });
                // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
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
        if (context) return;
        isOnlineMode = true;
        isHost = false;
        connectionStatusEl.textContent = 'トークンを取得中...';
        connectButton.disabled = true;

        try {
            // --- トークン取得処理 ---
            const res = await fetch('https://command-battle-online2-8j5m.vercel.app/api/token');
            if (!res.ok) throw new Error(`トークンサーバーからの応答が不正です: ${res.status}`);
            const { token } = await res.json();
            if (!token) throw new Error('トークンの取得に失敗しました。');
            // -----------------------

            connectionStatusEl.textContent = 'ルームに接続中...';
            context = await SkyWayContext.Create(token);
            room = await SkyWayRoom.Find(context, { name: remoteRoomId });
            if (!room) throw new Error('ルームが見つかりません。');

            localPerson = await room.join();

            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);

            for (const publication of room.publications) {
                if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                }
            }

            connectionStatusEl.textContent = '✅ 接続完了！';
            connectButton.disabled = false;
            onlinePartyGoButton.classList.remove('hidden');

        } catch (error) {
            console.error('クライアント接続エラー:', error);
            connectionStatusEl.textContent = `エラー: ${error.message}`;
            connectButton.disabled = false;
            await cleanupSkyWay();
        }
    }

    // データストリームの受信ハンドラ
    function handleDataStream(stream) {
        stream.onData.add(({ data }) => {
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
