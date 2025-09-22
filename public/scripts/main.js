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
                logMessage('対戦相手が入室しました。');
                for (const publication of e.member.publications) {
                    if (publication.contentType === 'data') {
                        const subscription = await localPerson.subscribe(publication.id);
                        handleDataStream(subscription.stream);
                        logMessage('✅ 相手のデータストリームを購読しました。', 'success');
                    }
                }
            });

            // ストリーム公開時のイベントリスナー
            room.onStreamPublished.add(async ({ publication }) => {
                if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                    logMessage('✅ 相手のデータストリームを購読しました。', 'success');
                }
            });

            localPerson = await room.join();
            dataStream = await SkyWayStreamFactory.createDataStream();
            // ストリームの公開
            const publication = await localPerson.publish(dataStream);

            // ストリームの公開が完了し、相手が購読を開始した後にデータ送信
            publication.onSubscriptionStarted.add((e) => {
                console.log("🟢 ホスト: 自身のデータストリームの購読が開始されました。");
                const partyData = window.getSelectedParty();
                if (partyData && partyData.length > 0) {
                    console.log("🔹 ホスト: パーティーデータを送信します。", partyData);
                    window.sendData({ type: 'party_data', party: partyData });
                } else {
                    console.warn("⚠️ パーティーデータが選択されていないため、送信をスキップします。");
                }
            });


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

    // データストリームの受信ハンドラ
    function handleDataStream(stream) {
        stream.onData.add(({ data }) => {
            try {
                const parsedData = JSON.parse(data);
                console.log('Received data:', parsedData);
                if (parsedData.type === 'party_data') {
                    window.handleOpponentParty(parsedData.party);
                    const onlineScreen = document.getElementById('online-screen');
                    const battleScreen = document.getElementById('battle-screen');
                    if (onlineScreen && battleScreen) {
                        onlineScreen.classList.add('hidden');
                        battleScreen.classList.remove('hidden');
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

function connectToRoom() {
    connection.on('open', () => {
        connectionStatusEl.textContent = '接続完了！パーティー編成に進んでください。';
        isOnlineMode = true;

        // パーティー編成画面に移動するボタンを生成
        const proceedButton = document.createElement('button');
        proceedButton.textContent = 'パーティー編成へ進む';
        proceedButton.className = 'proceed-button';
        proceedButton.style.cssText = `
            background: linear-gradient(135deg, #ff6b35, #ff8e53);
            color: white;
            font-size: 1.8em;
            font-weight: bold;
            padding: 20px 40px;
            border: none;
            border-radius: 15px;
            cursor: pointer;
            margin-top: 30px;
            box-shadow: 0 8px 16px rgba(255, 107, 53, 0.3);
            transition: all 0.3s ease;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
            animation: pulse 2s infinite;
        `;

        // 既存の「冒険開始」ボタンと同じ機能を直接実装
        proceedButton.addEventListener('click', () => {
            const onlineScreen = document.getElementById('online-screen');
            const partyScreen = document.getElementById('party-screen');
            if (onlineScreen) {
                onlineScreen.classList.add('hidden');
            }
            partyScreen.classList.remove('hidden');
        });

        // ホバー効果を追加
        proceedButton.addEventListener('mouseenter', () => {
            proceedButton.style.transform = 'translateY(-3px) scale(1.05)';
            proceedButton.style.boxShadow = '0 12px 24px rgba(255, 107, 53, 0.4)';
        });

        proceedButton.addEventListener('mouseleave', () => {
            proceedButton.style.transform = 'translateY(0) scale(1)';
            proceedButton.style.boxShadow = '0 8px 16px rgba(255, 107, 53, 0.3)';
        });

        const onlineControls = document.querySelector('.online-controls');
        if (onlineControls && !document.querySelector('.proceed-button')) {
            onlineControls.appendChild(proceedButton);
        }
    });

    connection.on('data', (data) => {
        handleReceivedData(data);
    });

    connection.on('close', () => {
        connectionStatusEl.textContent = '接続が切断されました。';
        isOnlineMode = false;
    });

    connection.on('error', (err) => {
        console.error('Connection Error:', err);
        connectionStatusEl.textContent = '接続エラーが発生しました。';
    });
}