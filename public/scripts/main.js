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
            }

            await dataStreamReadyPromise;

            const partyToSend = window.getPlayerParty();
            if (!partyToSend) {
                console.error('パーティー情報が見つかりません。');
                return;
            }

            const partyDataForSend = JSON.parse(JSON.stringify(partyToSend));
            partyDataForSend.forEach(member => {
                if (member.passive) delete member.passive.desc;
                if (member.active) member.active.forEach(skill => delete skill.desc);
                if (member.special) delete member.special.desc;
            });

            const sent = await window.sendData({ type: 'party_ready', party: partyDataForSend });
            if (sent) {
                console.log('パーティー情報送信完了');
                window.logMessage('パーティー情報を送信しました。相手の準備を待っています...');
            } else {
                console.error('パーティー情報の送信に失敗しました。');
                window.logMessage('パーティー情報の送信に失敗しました。', 'error');
            }
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
        goButton.disabled = false;
    });


    // === SkyWay関連の関数 ===

    async function initializeAsHost() {
        if (context) return;
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
                type: 'p2p',
                name: roomName,
            });

            localPerson = await room.join();

            myPeerIdEl.textContent = room.name;
            connectionStatusEl.textContent = '相手の接続を待っています...';
            copyIdButton.disabled = false;

            room.onMemberJoined.once(async ({ member }) => {
                connectionStatusEl.textContent = `✅ 相手が接続しました！`;
                onlinePartyGoButton.classList.remove('hidden');
                window.sendData({ type: 'connection_established' });
            });

            room.onStreamPublished.add(async ({ publication }) => {
                if (publication.publisher.id === localPerson.id) return;
                if (publication.contentType !== 'data') return;
                const subscription = await localPerson.subscribe(publication.id);
                handleDataStream(subscription.stream);
                console.log(`[Host] クライアント (${publication.publisher.id}) のストリームを購読しました。`);
            });

            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);
            resolveDataStreamReady();

        } catch (error) {
            console.error('ホスト初期化エラー:', error);
            connectionStatusEl.textContent = `エラー: ${error.message}`;
            await cleanupSkyWay();
        }
    }

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

            room.onStreamPublished.add(async ({ publication }) => {
                if (publication.publisher.id === localPerson.id) return;
                if (publication.contentType !== 'data') return;
                const subscription = await localPerson.subscribe(publication.id);
                handleDataStream(subscription.stream);
                console.log(`[Client] ホスト (${publication.publisher.id}) のストリームを購読しました。`);
            });

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

    function handleDataStream(stream) {
        console.log('データストリーム購読開始:', stream);
        stream.onData.add(async ({ data }) => {
            try {
                // 受信データがundefined, null, または文字列でない、空文字列、あるいは文字列"undefined"の場合は処理を中断
                if (typeof data !== 'string' || data.trim() === '') {
                    console.error('無効なデータが受信されました: undefined, null, 文字列ではない、または空です。', data);
                    return;
                }
                // 文字列"undefined"または"null"が送られてきた場合は、JSONパースせずに処理を中断
                if (data === 'undefined' || data === 'null') {
                    console.warn('受信データが文字列の"undefined"または"null"です。JSONパースをスキップします。', data);
                    return;
                }

                let parsedData;
                try {
                    parsedData = JSON.parse(data);
                } catch (e) {
                    console.error('受信データのJSON解析に失敗しました:', e, 'データ:', data);
                    return;
                }
                console.log("Received data:", parsedData);

                if (parsedData.type === 'connection_established') {
                    onlinePartyGoButton.classList.remove('hidden');
                } else if (parsedData.type === 'party_ready') {
                    console.log('相手のパーティー情報を受信:', parsedData.party);
                    window.logMessage('対戦相手のパーティー情報を受信しました。');
                    window.handleOpponentParty(parsedData.party);
                    window.checkBothPartiesReady();
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
                } else if (parsedData.type === 'start_battle') {
                    window.handleBattleAction(parsedData);
                }
            } catch (error) {
                console.error('受信データの解析または処理に失敗しました:', error);
            }
        });
    }

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

            resolveDataStreamReady = null;
            dataStreamReadyPromise = new Promise(resolve => {
                resolveDataStreamReady = resolve;
            });
            console.log("✅ cleanupSkyWay 完了");
        }
    }

    window.sendData = async function (data) {


        if (data === undefined || data === null || (typeof data === 'object' && Object.keys(data).length === 0)) {
            console.warn("送信するデータが無効です (undefined, null, または空のオブジェクト)。送信を中断します。", data);
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

    window.isOnlineMode = () => isOnlineMode;
    window.isHost = () => isHost;
});