// main.js (統合版 - シングルプレイとオンライン対戦対応 )

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
    const titleScreen = document.getElementById('title-screen');
    const partyScreen = document.getElementById('party-screen');
    const battleScreen = document.getElementById('battle-screen');
    const onlineScreen = document.getElementById('online-screen');

    // タイトル画面
    const startButton = document.getElementById('start-button');
    const onlineButton = document.getElementById('online-button');

    // オンライン画面
    const backToTitleButton = document.getElementById('back-to-title-button');
    const connectionModeSelection = document.getElementById('connection-mode-selection');
    const onlineHostButton = document.getElementById('online-host-button');
    const onlineJoinButton = document.getElementById('online-join-button');

    // ホスト用UI
    const hostInfo = document.getElementById('host-info');
    const myPeerIdEl = document.getElementById('my-peer-id');
    const copyIdButton = document.getElementById('copy-id-button');
    const hostConnectionStatusEl = document.getElementById('host-connection-status');

    // クライアント用UI
    const clientControls = document.getElementById('client-controls');
    const remoteRoomIdInput = document.getElementById('remote-room-id-input');
    const connectButton = document.getElementById('connect-button');
    const clientConnectionStatusEl = document.getElementById('client-connection-status');

    // 共通UI
    const onlinePartyGoButton = document.getElementById('online-party-go-button');

    // パーティー画面
    const partyGoButton = document.getElementById('go-button');


    // === イベントリスナー ===

    // 「冒険開始」ボタン（シングルプレイ）
    startButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        isOnlineMode = false;
    });

    // 「オンライン対戦」ボタン
    onlineButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        onlineScreen.classList.remove('hidden');
        isOnlineMode = true;
        // 初期状態に戻す
        connectionModeSelection.classList.remove('hidden');
        hostInfo.classList.add('hidden');
        clientControls.classList.add('hidden');
        onlinePartyGoButton.classList.add('hidden');
    });

    // 「ホストとしてルームを作成」ボタン
    onlineHostButton.addEventListener('click', () => {
        connectionModeSelection.classList.add('hidden');
        hostInfo.classList.remove('hidden');
        initializeAsHost();
    });

    // 「既存のルームに参加」ボタン
    onlineJoinButton.addEventListener('click', () => {
        connectionModeSelection.classList.add('hidden');
        clientControls.classList.remove('hidden');
    });

    // 「接続」ボタン（クライアント）
    connectButton.addEventListener('click', () => {
        const remoteRoomId = remoteRoomIdInput.value;
        if (remoteRoomId) {
            connectToRoom(remoteRoomId);
        } else {
            alert('ルームIDを入力してください。');
        }
    });

    // 「タイトルに戻る」ボタン
    backToTitleButton.addEventListener('click', () => {
        cleanupSkyWay();
        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
    });

    // ルームIDをクリップボードにコピー
    copyIdButton.addEventListener('click', () => {
        const peerId = myPeerIdEl.textContent;
        navigator.clipboard.writeText(peerId).then(() => {
            alert('ルームIDをコピーしました！');
        }).catch(err => {
            console.error('コピーに失敗しました:', err);
            alert('コピーに失敗しました。');
        });
    });

    // 「冒険へ」ボタン（パーティー編成後）
    partyGoButton.addEventListener('click', () => {
        const selectedParty = window.getSelectedParty();
        if (selectedParty.length === 0) {
            alert('パーティーは1人以上で編成してください。');
            return;
        }

        partyScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');

        if (isOnlineMode) {
            // オンラインバトル開始処理
            window.startOnlineBattle(selectedParty);
        } else {
            // シングルプレイヤーバトル開始処理
            window.startBattle(selectedParty);
        }
    });

    // 「パーティー編成へ」ボタン（オンライン接続後）
    onlinePartyGoButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        logMessage('パーティーを編成してください。');
    });


    // === SkyWay関連の関数 ===

    // SkyWayを初期化し、ホストとしてルームを作成する
    async function initializeAsHost() {
        if (context) return;
        isHost = true;
        hostConnectionStatusEl.textContent = 'ルームを作成中...';
        copyIdButton.disabled = true;

        try {
            context = await SkyWayContext.Create(generateUuidV4());
            const roomName = generateUuidV4();
            room = await SkyWayRoom.FindOrCreate(context, {
                name: roomName,
                type: 'p2p',
            });
            localPerson = await room.join();

            if (!localPerson) throw new Error('ルームへの参加に失敗しました');

            myPeerIdEl.textContent = room.name;
            hostConnectionStatusEl.textContent = '対戦相手の参加を待っています...';
            copyIdButton.disabled = false;

            // データストリームの準備
            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);

            // 相手が参加した時のイベント
            room.onPersonJoined.addOnce(async ({ person }) => {
                hostConnectionStatusEl.textContent = `✅ ${person.id} が参加しました！`;
                onlinePartyGoButton.classList.remove('hidden'); // パーティー編成ボタン表示

                // 相手のストリームを購読
                const { publication } = await room.waitForPublication({ publisher: person });
                if (publication.contentType === 'data') {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                }
            });

            // 相手が退出した時のイベント
            room.onPersonLeft.add(({ person }) => {
                alert('対戦相手が退出しました。');
                cleanupSkyWay();
                backToTitleButton.click(); // タイトル画面に戻る
            });

        } catch (error) {
            console.error('SkyWayホスト初期化エラー:', error);
            hostConnectionStatusEl.textContent = 'エラーが発生しました。';
            alert('ルームの作成に失敗しました。ページを再読み込みしてください。');
        }
    }

    // SkyWayルームにクライアントとして接続する
    async function connectToRoom(remoteRoomId) {
        if (context) return;
        isHost = false;
        clientConnectionStatusEl.textContent = 'ルームに接続中...';
        connectButton.disabled = true;

        try {
            context = await SkyWayContext.Create(generateUuidV4());
            room = await SkyWayRoom.Find(context, { name: remoteRoomId });
            if (!room) throw new Error('指定されたルームが見つかりません。');

            localPerson = await room.join();
            if (!localPerson) throw new Error('ルームへの参加に失敗しました');

            clientConnectionStatusEl.textContent = '✅ 接続に成功しました！';
            onlinePartyGoButton.classList.remove('hidden'); // パーティー編成ボタン表示
            connectButton.disabled = false;

            // データストリームの準備
            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);

            // 既存のメンバー（ホスト）のストリームを購読
            for (const publication of room.publications) {
                if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                }
            }

            // ホストが退出した際のイベント
            room.onPersonLeft.add(({ person }) => {
                alert('ホストが退出しました。');
                cleanupSkyWay();
                backToTitleButton.click(); // タイトル画面に戻る
            });

        } catch (err) {
            console.error('SkyWayクライアント接続エラー:', err);
            clientConnectionStatusEl.textContent = `接続エラー: ${err.message}`;
            connectButton.disabled = false;
        }
    }

    // データストリームの受信ハンドラ
    function handleDataStream(stream) {
        stream.onData.add(({ data }) => {
            try {
                const parsedData = JSON.parse(data);
                console.log('Received data:', parsedData);

                // === データタイプに応じた処理 ===
                if (parsedData.type === 'party_data') {
                    window.handleOpponentParty(parsedData.party);
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
                console.error('受信データの処理に失敗しました:', error);
                window.logMessage('受信データにエラーが発生しました。', 'error');
            }
        });
    }

    // SkyWayリソースのクリーンアップ
    async function cleanupSkyWay() {
        console.log("🧹 SkyWayリソースをクリーンアップします");
        try {
            if (localPerson) {
                await localPerson.leave();
                localPerson = null;
            }
            if (room) {
                await room.close();
                room = null;
            }
            if (context) {
                await context.dispose();
                context = null;
            }
            dataStream = null;
            isHost = false;
        } catch (err) {
            console.warn("⚠️ クリーンアップ中にエラーが発生しました (無視してOK):", err);
        }
        console.log("✅ クリーンアップ完了");
    }

    // === グローバルに公開する関数 ===

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
            console.warn('データストリームが利用できないか、データが無効です。', { data });
        }
    };

    // オンラインモードかどうかの状態
    window.isOnlineMode = () => isOnlineMode;

    // ホストかどうかの状態
    window.isHost = () => isHost;
});
