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

window.isHost = () => isHost;
window.isOnlineMode = () => isOnlineMode;

// DOM要素の取得
const startScreen = document.getElementById('start-screen');
const modeSelectionScreen = document.getElementById('mode-selection-screen');
const onlineSetupScreen = document.getElementById('online-setup-screen');
const partyScreen = document.getElementById('party-screen');
const battleScreen = document.getElementById('battle-screen');
const singlePlayButton = document.getElementById('single-play-button');
const onlinePlayButton = document.getElementById('online-play-button');
const hostButton = document.getElementById('host-button');
const joinButton = document.getElementById('join-button');
const goButton = document.getElementById('go-button');
const onlinePartyGoButton = document.getElementById('online-party-go-button');
const myPeerIdEl = document.getElementById('my-peer-id');
const connectionStatusEl = document.getElementById('connection-status');
const peerIdInput = document.getElementById('peer-id-input');
const disconnectButton = document.getElementById('disconnect-button');
const logMessageEl = document.getElementById('message-log');

// --- SkyWay関連関数 ---

async function connectToSkyWay() {
    try {
        window.logMessage('ステップ1: トークンを取得します...');
        const token = await getToken();
        window.logMessage('ステップ1: トークン取得完了。');

        window.logMessage('ステップ2: SkyWayコンテキストを作成します...');
        context = await SkyWayContext.Create(token);
        window.logMessage('ステップ2: SkyWayコンテキスト作成完了。');

        window.logMessage('ステップ3: ルームに参加します...');
        const roomName = isHost ? generateUuidV4() : peerIdInput.value;
        if (!roomName) {
            window.logMessage('有効なルームIDを入力してください。', 'error');
            return;
        }

        room = await SkyWayRoom.FindOrCreate(context, {
            name: roomName,
            type: 'sfu'
        });
        window.logMessage('ステップ3: ルーム参加処理完了。');

        window.logMessage('ステップ4: メンバーとしてjoinします...');
        localPerson = await room.join();
        window.logMessage('ステップ4: メンバーとしてjoin完了。');

        myPeerIdEl.textContent = localPerson.id;
        connectionStatusEl.textContent = '接続済み';

        const myStream = await SkyWayStreamFactory.createDataStream();
        await localPerson.publish(myStream);
        dataStream = myStream;
        resolveDataStreamReady();
        console.log('✅ 自分のデータストリーム公開');

        window.logMessage('全ての接続処理が完了しました。');

        // ホストとクライアントでイベントリスナーを設定
        if (isHost) {
            room.onStreamPublished.add(async ({ publication }) => {
                if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                    console.log(`[Host] クライアント (${publication.publisher.id}) のストリームを購読しました。`);
                }
            });
            await window.sendData({ type: 'connection_established' });
        } else {
            room.onStreamPublished.add(async ({ publication }) => {
                if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                    console.log(`[Client] ホスト (${publication.publisher.id}) のストリームを購読しました。`);
                }
            });
        }

    } catch (error) {
        console.error('SkyWay接続中にエラーが発生しました:', error);
        window.logMessage(`接続中にエラーが発生しました: ${error.message}`, 'error');
        cleanupSkyWay();
    }
}

async function getToken() {
    const res = await fetch('https://skyway.example.com/token');
    if (!res.ok) {
        throw new Error(`トークンの取得に失敗しました: ${res.statusText}`);
    }
    const { token } = await res.json();
    return token;
}

// データストリームハンドラー
function handleDataStream(stream) {
    stream.onData.add(async ({ data }) => {
        try {
            // データがundefinedでないか、空でないかを確認
            if (!data || data === 'undefined' || data === '') {
                console.error('無効なデータが受信されました: ', data);
                return;
            }

            console.log('生データ受信:', data);
            const parsedData = JSON.parse(data);
            console.log('Received data:', parsedData);

            if (parsedData.type === 'connection_established') {
                onlinePartyGoButton.classList.remove('hidden');
                window.logMessage('ホストと接続が確立しました。パーティーを選択して対戦準備を進めてください。');
            } else if (parsedData.type === 'party_ready') {
                console.log('相手のパーティー情報を受信:', parsedData.party);
                logMessage('対戦相手のパーティー情報を受信しました。');
                
                // battle.jsの関数を呼び出して相手パーティー情報を処理
                window.handleOpponentParty(parsedData.party);
                
                // クライアントは相手からデータを受信したら、自分のデータを送信
                if (!window.isHost()) {
                    const partyToSend = window.getPlayerParty();
                    if (partyToSend) {
                        const partyDataForSend = JSON.parse(JSON.stringify(partyToSend));
                        partyDataForSend.forEach(member => {
                            if (member.passive) delete member.passive.desc;
                            if (member.active) member.active.forEach(skill => delete skill.desc);
                            if (member.special) delete member.special.desc;
                        });
                        await window.sendData({ type: 'party_ready', party: partyDataForSend });
                        logMessage('自分のパーティー情報を送信しました。');
                    }
                }
                
                // ここでチェック関数を呼び出す
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

// 切断処理
async function cleanupSkyWay() {
    console.log('🧹 cleanupSkyWay 実行');
    try {
        if (localPerson) {
            await localPerson.unpublish();
            console.log('✅ ストリーム公開解除');
        }
        if (room) {
            await room.close();
            console.log('✅ ルーム退室');
        }
        if (context) {
            await context.dispose();
            console.log('✅ コンテキスト破棄');
        }
    } catch (error) {
        console.error('SkyWayクリーンアップ中にエラーが発生しました:', error);
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
        return false;
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
        return true;
    } catch (error) {
        console.error('データ送信に失敗しました:', error);
        return false;
    }
}

// --- イベントリスナー ---

onlinePlayButton.addEventListener('click', () => {
    isOnlineMode = true;
    modeSelectionScreen.classList.add('hidden');
    onlineSetupScreen.classList.remove('hidden');
    goButton.disabled = true; // オンライン設定が完了するまでGoボタンを無効化
});

hostButton.addEventListener('click', async () => {
    isHost = true;
    onlineSetupScreen.classList.add('hidden');
    window.logMessage('ホストとしてルームを作成中...');
    await connectToSkyWay();
    logMessage('他のプレイヤーの参加を待っています...');
    onlinePartyGoButton.classList.remove('hidden');
});

joinButton.addEventListener('click', async () => {
    isHost = false;
    onlineSetupScreen.classList.add('hidden');
    window.logMessage('ホストのルームに参加中...');
    await connectToSkyWay();
    logMessage('ホストからの接続を待っています...');
    // クライアントはホストからconnection_establishedを受け取ってからGoボタンを表示する
});

disconnectButton.addEventListener('click', () => {
    cleanupSkyWay();
    onlineSetupScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
});

goButton.addEventListener('click', async () => {
    const selectedParty = window.getSelectedParty();
    if (!selectedParty) {
        logMessage('パーティーメンバーを4人選択してください。', 'error');
        return;
    }

    // シングルプレイかオンラインか
    if (isOnlineMode) {
        // オンラインモードの場合は、まずパーティー情報を初期化
        window.initializePlayerParty(selectedParty);

        // オンラインモードの場合は戦闘画面に遷移してから処理
        partyScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');
        logMessage('自分のパーティーの準備が完了しました。');

        // ホストは最初にデータを送信する
        if (isHost) {
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
                logMessage('パーティー情報を送信しました。相手の準備を待っています...');
            } else {
                console.error('パーティー情報の送信に失敗しました。');
                logMessage('パーティー情報の送信に失敗しました。', 'error');
            }
        } else {
            // クライアントはホストからの party_ready メッセージを待機
            logMessage('ホストからのパーティー情報を受信を待っています...');
        }
    } else {
        // シングルプレイの場合は戦闘画面に遷移してから戦闘開始
        partyScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');
        window.startBattle(selectedParty);
    }
});

// 初期画面表示
startScreen.classList.remove('hidden');