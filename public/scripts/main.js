// main.js (統合版 - シングルプレイとオンライン対戦対応)

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
    // ボタンと画面要素の取得
    const startButton = document.getElementById('start-button');
    const onlineButton = document.getElementById('online-button');
    const backButton = document.getElementById('back-button');
    const startAdventureButton = document.getElementById('go-button');
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

    // 「冒険開始」ボタン（シングルプレイ）
    startButton.addEventListener('click', () => {
        isOnlineMode = false;
        titleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
    });

    // 「オンライン対戦」ボタン（ホストとしてルーム作成）
    onlineButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        onlineScreen.classList.remove('hidden');
        initializeSkyWay();
    });

    // 「戻る」ボタン
    backButton.addEventListener('click', () => {
        partyScreen.classList.add('hidden');
        if (isOnlineMode) {
            onlineScreen.classList.remove('hidden');
        } else {
            titleScreen.classList.remove('hidden');
        }
    });

    // 「タイトルに戻る」ボタン
    backToTitleButton.addEventListener('click', async () => {
        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        await cleanupSkyWay();
        isHost = false;
        isOnlineMode = false;
    });

    // 「出かける」ボタン（シングルプレイ開始）
    startAdventureButton.addEventListener('click', () => {
        const partyMembers = window.getSelectedParty();
        if (partyMembers.length < 1) {
            alert('パーティーは1人以上で編成してください。');
            return;
        }
        partyScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');
        window.startBattle(partyMembers);
    });

    // 「接続」ボタン（クライアントとしてルーム参加）
    connectButton.addEventListener('click', () => {
        console.log("✅ 接続ボタン押された");
        const remoteRoomId = peerIdInput.value;
        if (remoteRoomId) {
            console.log("入力されたルームID:", remoteRoomId);
            connectToRoom(remoteRoomId);
        } else {
            alert('接続先のIDを入力してください。');
        }
    });

    // 「IDをコピー」ボタン
    copyIdButton.addEventListener('click', () => {
        const roomId = myPeerIdEl.textContent;
        navigator.clipboard.writeText(roomId)
            .then(() => alert('IDがクリップボードにコピーされました！'))
            .catch(err => console.error('コピーに失敗しました', err));
    });

    // === SkyWay関連のロジック ===

    // SkyWayを初期化し、ホストとしてルームを作成する
    async function initializeSkyWay() {
        if (context) return;
        isOnlineMode = true;
        connectionStatusEl.textContent = '初期化中...';
        copyIdButton.disabled = true;

        try {
            const res = await fetch('https://command-battle-online2-3p3l.vercel.app/api/token');
            const { token } = await res.json();
            if (!token) throw new Error('トークンの取得に失敗しました。');

            context = await SkyWayContext.Create(token);

            const roomId = generateUuidV4();
            room = await SkyWayRoom.FindOrCreate(context, {
                type: 'p2p',
                name: `game_room_${roomId}`,
            });

            if (!room) {
                throw new Error('ルームが作成できませんでした');
            }

            isHost = true;

            // メンバー入室時のイベントリスナー
            room.onMemberJoined.add(async (e) => {
                console.log("🟢 ホスト: メンバー入室イベントが発火しました！", e.member.id);
                logMessage('対戦相手が入室しました。');

                // すでに公開されているストリームをすべて購読
                for (const publication of e.member.publications) {
                    if (publication.contentType === 'data') {
                        const subscription = await localPerson.subscribe(publication.id);
                        handleDataStream(subscription.stream);
                        logMessage('✅ 相手のデータストリームを購読しました。', 'success');

                        // 購読完了後、ホストからパーティーデータを送信
                        const partyData = window.getSelectedParty();
                        if (partyData) {
                            window.sendData({ type: 'party_data', party: partyData });
                        }
                    }
                }
            });

            // ストリーム公開時のイベントリスナー
            room.onStreamPublished.add(async ({ publication }) => {
                console.log("🟢 ホスト: ストリーム公開イベントが発火しました！");
                if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                    logMessage('✅ 相手のデータストリームを購読しました。', 'success');
                }
            });

            localPerson = await room.join();
            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);

            myPeerIdEl.textContent = room.name;
            connectionStatusEl.textContent = 'ルームID: ' + room.name;
            logMessage('ホストとしてルームを作成しました。対戦相手の参加を待っています...', 'success');
            copyIdButton.disabled = false;

        } catch (error) {
            console.error('Failed to initialize SkyWay:', error);
            connectionStatusEl.textContent = 'エラー: ' + (error.message || '初期化に失敗しました');
            logMessage('エラー: 初期化に失敗しました。詳細をコンソールで確認してください。', 'error');
            await cleanupSkyWay();
        }
    }

    // クライアントとして既存のルームに参加する
    async function connectToRoom(roomId) {
        console.log("🔹 connectToRoom: 接続開始");
        connectionStatusEl.textContent = '接続中...';

        if (context) {
            console.log("⚠️ 既存コンテキストを破棄します");
            await cleanupSkyWay();
            console.log("✅ 既存コンテキストの破棄が完了しました");
        }

        try {
            console.log("🔹 connectToRoom: トークン取得開始");
            const res = await fetch('https://command-battle-online2-3p3l.vercel.app/api/token');
            const { token } = await res.json();
            if (!token) throw new Error('トークンの取得に失敗しました。');
            console.log("✅ connectToRoom: トークン取得完了");

            console.log("🔹 connectToRoom: SkyWayContext作成開始");
            const contextPromise = SkyWayContext.Create(token);
            context = await Promise.race([
                contextPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error("SkyWayContext.Create がタイムアウト")), 15000))
            ]);
            console.log("✅ connectToRoom: SkyWayContext作成完了");

            console.log("🔹 connectToRoom: ルーム検索/作成開始");
            const room = await SkyWayRoom.FindOrCreate(context, {
                type: "p2p",
                name: roomId
            });
            if (!room) {
                throw new Error('指定されたルームが見つかりません。');
            }
            console.log("✅ connectToRoom: ルーム取得完了");

            isHost = false;
            localPerson = await room.join();
            console.log("✅ connectToRoom: ルーム参加完了");

            room.onMemberJoined.add(async ({ member }) => {
                logMessage('対戦相手が入室しました。');
                for (const publication of member.publications) {
                    if (publication.contentType === 'data') {
                        const subscription = await localPerson.subscribe(publication.id);
                        handleDataStream(subscription.stream);
                        logMessage('✅ 相手のデータストリームを購読しました。', 'success');
                    }
                }
                const partyData = window.getSelectedParty();
                if (partyData) {
                    window.sendData({ type: 'party_data', party: partyData });
                }
            });

            room.onStreamPublished.add(async ({ publication }) => {
                if (publication.contentType === 'data' && localPerson && publication.publisher.id !== localPerson.id) {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                    logMessage('✅ 相手のデータストリームを購読しました。', 'success');
                }
            });

            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);
            console.log("✅ connectToRoom: 自身のデータストリームを公開しました。");

            myPeerIdEl.textContent = room.name;
            connectionStatusEl.textContent = 'ルームID: ' + room.name;
            copyIdButton.disabled = false;
            logMessage('ルームに参加しました。', 'success');

        } catch (error) {
            console.error('❌ connectToRoom: エラー発生:', error);
            connectionStatusEl.textContent = 'エラー: ' + (error.message || '接続に失敗しました');
            logMessage('エラー: 接続に失敗しました。詳細をコンソールで確認してください。', 'error');
            await cleanupSkyWay();
        }
    }

    // データストリームの受信ハンドラ
    function handleDataStream(stream) {
        stream.onData.add(({ data }) => {
            try {
                const parsedData = JSON.parse(data);
                console.log('Received data:', parsedData);
                if (parsedData.type === 'party_data') {
                    window.handleOpponentParty(parsedData.party);
                    // 相手のパーティーデータを受信したら、バトル画面へ遷移
                    // このロジックはホストとクライアント両方に必要
                    if (isOnlineMode) {
                        const onlineScreen = document.getElementById('online-screen');
                        const battleScreen = document.getElementById('battle-screen');
                        onlineScreen.classList.add('hidden');
                        battleScreen.classList.remove('hidden');
                        // オンラインバトルを開始する関数を呼び出し
                        window.startOnlineBattle(parsedData.party);
                    }
                } else if (parsedData.type === 'start_battle') {
                    window.startBattleClientSide();
                } else if (parsedData.type === 'log_message') {
                    window.logMessage(parsedData.message, parsedData.messageType);
                } else if (parsedData.type === 'request_action') {
                    window.handleRemoteActionRequest(parsedData.actorUniqueId);
                } else if (parsedData.type === 'execute_action') {
                    window.executeAction(parsedData);
                } else if (parsedData.type === 'action_result') {
                    window.handleActionResult(parsedData.result);
                }
            } catch (error) {
                console.error('Failed to parse received data:', error);
            }
        });
    }

    // SkyWayリソースのクリーンアップ
    async function cleanupSkyWay() {
        console.log("🧹 cleanupSkyWay 実行");
        try {
            if (localPerson) {
                await localPerson.leave();
                localPerson = null;
            }
            if (dataStream) {
                dataStream = null;
            }
            if (room) {
                await room.close();
                room = null;
            }
            if (context) {
                context.dispose();
                context = null;
            }
        } catch (err) {
            console.warn("⚠️ cleanupSkyWay エラー (無視してOK):", err);
        }
        console.log("✅ cleanupSkyWay 完了");
    }

    // データ送信関数をグローバルに公開
    window.sendData = function (data) {
        if (dataStream) {
            try {
                const serializedData = JSON.stringify(data);
                dataStream.write(serializedData);
                console.log('Sent data:', serializedData);
            } catch (error) {
                console.error('Failed to send data:', error);
            }
        } else {
            console.warn('Data stream not available for sending data');
        }
    };

    // オンラインモードかどうかの状態を返す関数
    window.isOnlineMode = function () {
        return isOnlineMode;
    };

    // ホストかどうかを返す関数
    window.isHost = function () {
        return isHost;
    };
});