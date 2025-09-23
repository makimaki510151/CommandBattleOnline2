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
    const titleScreen = document.getElementById('title-screen');
    const partyScreen = document.getElementById('party-screen');
    const onlineScreen = document.getElementById('online-screen');
    const onlineHostButton = document.getElementById('online-host-button');
    const backToTitleFromOnlineButton = document.getElementById('back-to-title-from-online-button');
    const connectToRoomButton = document.getElementById('connect-to-room-button');
    const connectionStatusEl = document.getElementById('connection-status');
    const myPeerIdEl = document.getElementById('my-peer-id');
    const copyIdButton = document.getElementById('copy-id-button');
    const partyGoButton = document.getElementById('go-button');
    const battleScreen = document.getElementById('battle-screen');
    const onlinePartyGoButton = document.getElementById('online-party-go-button');
    const remoteRoomIdInput = document.getElementById('remote-room-id-input');
    const peerInfoEl = document.querySelector('.peer-info'); // peer-info クラスを持つ要素を追加
    const connectionControlsEl = document.querySelector('.connection-controls'); // connection-controls クラスを持つ要素を追加

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

        // ホスト/クライアント選択のUIを表示
        onlineHostButton.classList.remove('hidden');
        connectionControlsEl.classList.remove('hidden');

        // ホストモードのUIを非表示
        peerInfoEl.classList.add('hidden');
    });

    // 「ホストとして開始」ボタン
    onlineHostButton.addEventListener('click', async () => {
        initializeSkyWay();
        onlineHostButton.classList.add('hidden');

        // ホストモードのUIを有効化
        peerInfoEl.classList.remove('hidden');
        connectionControlsEl.classList.add('hidden');
    });

    // 「接続」ボタン（クライアント）
    connectToRoomButton.addEventListener('click', () => {
        const remoteRoomId = remoteRoomIdInput.value;
        if (remoteRoomId) {
            connectToRoom();
        } else {
            alert('ルームIDを入力してください。');
        }
    });


    // 「戻る」ボタン
    if (backToTitleFromOnlineButton) { // nullチェックを追加
        backToTitleFromOnlineButton.addEventListener('click', () => {
            cleanupSkyWay();
            onlineScreen.classList.add('hidden');
            titleScreen.classList.remove('hidden');
            onlineHostButton.classList.remove('hidden');
            connectionControlsEl.classList.remove('hidden');
        });
    }

    // ルームIDをクリップボードにコピー
    copyIdButton.addEventListener('click', () => {
        const peerId = myPeerIdEl.textContent;
        navigator.clipboard.writeText(peerId).then(() => {
            logMessage('ルームIDをコピーしました！', 'success');
        }).catch(err => {
            console.error('コピーに失敗しました:', err);
        });
    });

    // 「冒険へ」ボタン
    partyGoButton.addEventListener('click', () => {
        const selectedParty = window.getSelectedParty();
        if (selectedParty.length === 0) {
            alert('パーティーは1人以上で編成してください。');
            return;
        }

        partyScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');

        if (isOnlineMode) {
            window.startOnlineBattle(selectedParty);
        } else {
            window.startBattle(selectedParty);
        }
    });

    // パーティー編成画面へ進むボタン
    onlinePartyGoButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        logMessage('パーティーを編成してください。');
    });

    // SkyWayを初期化し、ホストとしてルームを作成する
    async function initializeSkyWay() {
        if (context) return;
        isOnlineMode = true;
        connectionStatusEl.textContent = '初期化中...';
        copyIdButton.disabled = true;

        try {
            context = await SkyWayContext.Create(generateUuidV4());
            const roomName = generateUuidV4();
            room = await SkyWayRoom.FindOrCreate(context, {
                name: roomName,
                type: 'p2p',
            });
            isHost = true;
            localPerson = await room.join();

            if (!localPerson) {
                throw new Error('ルームへの参加に失敗しました');
            }

            showProceedButton();

            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);

            // 相手がルームに参加した際のイベント
            room.onPersonJoined.addOnce(() => {
                logMessage('相手がルームに参加しました。');
                onlinePartyGoButton.classList.remove('hidden');
            });

            // 相手がデータストリームを公開した際のイベント
            room.onStreamPublished.add(async ({ publication }) => {
                if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                    logMessage('✅ 相手のデータストリームを購読しました。', 'success');
                }
            });

            // 相手が退出した際のイベント
            room.onPersonLeft.add(() => {
                logMessage('対戦相手が退出しました。', 'error');
                cleanupSkyWay();
            });

            myPeerIdEl.textContent = room.name;
            connectionStatusEl.textContent = 'ルームID: ' + room.name;
            logMessage('ホストとしてルームを作成しました。対戦相手の参加を待っています...', 'success');
            copyIdButton.disabled = false;

        } catch (error) {
            console.error('SkyWay初期化エラー:', error);
            connectionStatusEl.textContent = '接続エラー';
            logMessage('接続エラーが発生しました。ページを再読み込みしてください。', 'error');
        }
    }

    // SkyWayルームにクライアントとして接続する
    async function connectToRoom() {
        const remoteRoomId = remoteRoomIdInput.value;
        if (!remoteRoomId) {
            logMessage('ルームIDを入力してください。', 'error');
            return;
        }

        logMessage('ルームに接続中...', 'info');
        connectToRoomButton.disabled = true;

        try {
            context = await SkyWayContext.Create(generateUuidV4());
            room = await SkyWayRoom.FindOrCreate(context, {
                name: remoteRoomId,
                type: 'p2p',
            });
            isHost = false;
            localPerson = await room.join();

            if (!localPerson) {
                throw new Error('ルームへの参加に失敗しました');
            }

            // 接続成功時に「パーティー編成へ行く」ボタンを表示
            onlinePartyGoButton.classList.remove('hidden'); // ★ この行を追加
            logMessage('🎉 ルームへの接続が完了しました！', 'success');
            connectToRoomButton.disabled = false;

            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);

            // 相手（ホスト）のストリームを待つ
            room.onStreamPublished.add(async ({ publication }) => {
                if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                    logMessage('✅ 相手のデータストリームを購読しました。', 'success');
                }
            });

            // ホストが退出した際のイベント
            room.onPersonLeft.add(() => {
                logMessage('ホストが退出しました。', 'error');
                cleanupSkyWay();
            });

        } catch (err) {
            logMessage(`接続エラー: ${err.message}`, 'error');
            console.error(err);
            connectToRoomButton.disabled = false;
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

                    const myPartyData = window.getSelectedParty();
                    if (myPartyData && myPartyData.length > 0) {
                        window.sendData({ type: 'party_data_response', party: myPartyData });
                    }

                } else if (parsedData.type === 'party_data_response') {
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
                console.error('Failed to parse or handle received data:', error);
                window.logMessage('受信データにエラーが発生しました。', 'error');
            }
        });
    }

    // パーティー編成画面へ進むボタンを表示する
    function showProceedButton() {
        const proceedButton = document.createElement('button');
        proceedButton.textContent = 'パーティー編成へ';
        proceedButton.classList.add('proceed-button');
        proceedButton.addEventListener('click', () => {
            onlineScreen.classList.add('hidden');
            partyScreen.classList.remove('hidden');
        });

        const connectionControls = document.querySelector('.connection-controls');
        if (connectionControls) {
            connectionControls.appendChild(proceedButton);
        }

        connectToRoomButton.classList.add('hidden');
        remoteRoomIdInput.classList.add('hidden');
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

    onlinePartyGoButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        logMessage('パーティーを編成してください。');
    });

    // データ送信関数をグローバルに公開
    window.sendData = function (data) {
        if (dataStream && data !== undefined) {
            try {
                const serializedData = JSON.stringify(data);
                dataStream.write(serializedData);
                console.log('Sent data:', serializedData);
            } catch (error) {
                console.error('Failed to send data:', error);
            }
        } else {
            console.warn('Data stream not available or data is invalid for sending.', { data });
        }
    };

    // オンラインモードかどうかの状態を返す関数
    window.isOnlineMode = function () {
        return isOnlineMode;
    };

    window.isHost = function () {
        return isHost;
    };
});