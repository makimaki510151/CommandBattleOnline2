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
            const res = await fetch('https://command-battle-online2-8j5m.vercel.app/api/token');
            const { token } = await res.json();
            if (!token) throw new Error('トークンの取得に失敗しました。');

            context = await SkyWayContext.Create(token);

            const roomId = generateUuidV4();
            room = await SkyWayRoom.FindOrCreate(context, {
                type: 'p2p',
                name: `game_room_${roomId}`,
            });

            // roomがnullでないか確認する
            if (!room) {
                throw new Error('ルームが作成できませんでした');
            }

            isHost = true;

            // localPersonがnullでないか確認する
            localPerson = await room.join();
            if (!localPerson) {
                throw new Error('ルームへの参加に失敗しました');
            }

            // メンバー入室時のイベントリスナー
            // roomがnull/undefinedでないことを確認してからaddを呼び出す
            if (room.onMemberJoined) {
                room.onMemberJoined.add(async (e) => {
                    logMessage('対戦相手が入室しました。');
                    for (const publication of e.member.publications) {
                        if (publication.contentType === 'data') {
                            const subscription = await localPerson.subscribe(publication.id);
                            handleDataStream(subscription.stream);
                            logMessage('✅ 相手のデータストリームを購読しました。', 'success');
                            isOnlineMode = true;
                            connectionStatusEl.textContent = '接続完了！';
                            showProceedButton();
                        }
                    }
                });
            }


            // ストリーム公開時のイベントリスナー
            // roomがnull/undefinedでないことを確認してからaddを呼び出す
            if (room.onStreamPublished) {
                room.onStreamPublished.add(async ({ publication }) => {
                    if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                        const subscription = await localPerson.subscribe(publication.id);
                        handleDataStream(subscription.stream);
                        logMessage('✅ 相手のデータストリームを購読しました。', 'success');
                    }
                });
            }

            dataStream = await SkyWayStreamFactory.createDataStream();

            // publicationがnull/undefinedでないか確認する
            const publication = await localPerson.publish(dataStream);
            if (!publication) {
                throw new Error('ストリームの公開に失敗しました');
            }

            // publicationがnull/undefinedでないことを確認してからaddを呼び出す
            if (publication.onSubscriptionStarted) {
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
            }

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

    // SkyWayルームにクライアントとして接続する
    async function connectToRoom(remoteRoomId) {
        if (context) {
            logMessage('既存の接続をリセットします...', 'info');
            await cleanupSkyWay();
        }

        isOnlineMode = true;
        connectionStatusEl.textContent = '初期化中...';
        logMessage('接続を開始しています...', 'info');

        try {
            console.log("🔹 1. トークンをフェッチしています...");
            const res = await fetch('https://command-battle-online2-8j5m.vercel.app/api/token');
            const { token } = await res.json();
            if (!token) throw new Error('トークンの取得に失敗しました。');
            console.log("✅ 1. トークン取得完了。");

            console.log("🔹 2. SkyWayコンテキストを作成しています...");
            context = await SkyWayContext.Create(token);
            console.log("✅ 2. SkyWayコンテキスト作成完了。");

            console.log(`🔹 3. ルームID「${remoteRoomId}」に参加しています...`);
            // ここを修正: FindではなくFindOrCreateを使用する
            room = await SkyWayRoom.FindOrCreate(context, {
                type: 'p2p',
                name: remoteRoomId,
            });

            if (!room) {
                throw new Error('指定されたルームへの参加に失敗しました');
            }
            console.log("✅ 3. ルーム参加準備完了。");

            console.log("🔹 4. ルームに参加しています...");
            localPerson = await room.join();
            if (!localPerson) {
                throw new Error('ルームへの参加に失敗しました');
            }
            console.log("✅ 4. ルーム参加完了。");

            console.log("🔹 5. データストリームを公開しています...");
            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);
            console.log("✅ 5. データストリーム公開完了。");

            isHost = false;

            // 相手がストリームを公開するのを待つ
            if (room.onStreamPublished) {
                room.onStreamPublished.add(async ({ publication }) => {
                    if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                        const subscription = await localPerson.subscribe(publication.id);
                        handleDataStream(subscription.stream);
                        logMessage('✅ 相手のデータストリームを購読しました。', 'success');
                        isOnlineMode = true;
                        connectionStatusEl.textContent = '接続完了！';
                        showProceedButton();
                    }
                });
            }

            isOnlineMode = true;
            connectionStatusEl.textContent = '接続完了！';
            showProceedButton();
            logMessage('🎉 ルームへの接続が完了しました！', 'success');

        } catch (error) {
            console.error('Failed to connect to room:', error);
            connectionStatusEl.textContent = 'エラー: ' + (error.message || '接続に失敗しました');
            logMessage('エラー: 接続に失敗しました。詳細をコンソールで確認してください。', 'error');
            await cleanupSkyWay();
        }
    }


    // 接続後に「パーティー編成へ進む」ボタンを表示する関数
    function showProceedButton() {
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

        proceedButton.addEventListener('click', () => {
            // クライアントの場合、ホストに画面遷移をリクエスト
            if (!isHost) {
                console.log("🔹 クライアント: ホストにパーティー編成画面への遷移をリクエストします。");
                window.sendData({ type: 'proceed_to_party' });
            }

            onlineScreen.classList.add('hidden');
            partyScreen.classList.remove('hidden');
        });

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
    }


    // データストリームの受信ハンドラ
    // データストリームの受信ハンドラ
    function handleDataStream(stream) {
        stream.onData.add(({ data }) => {
            try {
                const parsedData = JSON.parse(data);
                console.log('Received data:', parsedData);

                // 新しいデータタイプ 'proceed_to_party' を追加
                if (parsedData.type === 'proceed_to_party') {
                    console.log("🟢 ホスト: クライアントからのパーティー編成画面への遷移リクエストを受信しました。");
                    const onlineScreen = document.getElementById('online-screen');
                    const partyScreen = document.getElementById('party-screen');
                    if (onlineScreen && partyScreen) {
                        onlineScreen.classList.add('hidden');
                        partyScreen.classList.remove('hidden');
                        logMessage('対戦相手がパーティー編成画面へ進みました。', 'info');
                    }
                    return; // 処理を終了
                }

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