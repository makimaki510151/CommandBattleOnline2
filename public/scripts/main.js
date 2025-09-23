// main.js (オンライン対戦フロー修正版)

// SkyWay SDKはグローバル変数として読み込まれることを想定
const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = window.skyway_room;

let context = null;
let room = null;
let localPerson = null;
let dataStream = null;
let isHost = false;
let isOnlineMode = false;
let myPartyReady = false;
let opponentPartyReady = false;

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
    const goButton = document.getElementById('go-button'); // シングルプレイ用
    const confirmPartyBtn = document.getElementById('confirm-party-btn'); // オンライン対戦用
    const connectButton = document.getElementById('connect-button');
    const createRoomBtn = document.getElementById('create-room-btn');
    const backToTitleButton = document.getElementById('back-to-title-button');
    const proceedToPartyBtn = document.getElementById('proceed-to-party-btn');

    const titleScreen = document.getElementById('title-screen');
    const onlineScreen = document.getElementById('online-screen');
    const partyScreen = document.getElementById('party-screen');
    const battleScreen = document.getElementById('battle-screen');

    const myPeerIdEl = document.getElementById('my-peer-id');
    const peerIdInput = document.getElementById('peer-id-input');
    const connectionStatusEl = document.getElementById('connection-status');

    // === イベントリスナーの修正 ===

    // 「冒険開始」ボタン（シングルプレイ）
    startButton.addEventListener('click', () => {
        isOnlineMode = false;
        titleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        goButton.classList.remove('hidden');
        confirmPartyBtn.classList.add('hidden');
    });

    // 「オンライン対戦」ボタン
    onlineButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        onlineScreen.classList.remove('hidden');
    });
    
    // 「ルーム作成」ボタン（ホスト）
    createRoomBtn.addEventListener('click', () => {
        initializeSkyWay(true);
    });

    // 「接続」ボタン（クライアント）
    connectButton.addEventListener('click', () => {
        const remoteRoomId = peerIdInput.value;
        if (remoteRoomId) {
            connectToRoom(remoteRoomId);
        } else {
            alert('接続先のIDを入力してください。');
        }
    });
    
    // 「パーティー編成へ進む」ボタン
    proceedToPartyBtn.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        // オンライン対戦用のボタンを表示
        goButton.classList.add('hidden');
        confirmPartyBtn.classList.remove('hidden');
    });

    // 「パーティー決定」ボタン（オンライン対戦用）
    confirmPartyBtn.addEventListener('click', () => {
        const partyMembers = window.getSelectedParty();
        if (partyMembers.length < 1) {
            alert('パーティーは1人以上で編成してください。');
            return;
        }
        
        // 自分のパーティーデータを送信し、準備完了フラグを立てる
        window.sendData({ type: 'party_data', party: partyMembers });
        window.sendData({ type: 'party_ready' });
        myPartyReady = true;

        logMessage('パーティーを決定しました。相手の準備を待っています...', 'info');
        
        // 両者が準備完了したら戦闘を開始
        checkBothReady();
    });

    // === SkyWay関連のロジック ===
    
    async function initializeSkyWay(asHost) {
        if (context) await cleanupSkyWay();
        
        isOnlineMode = true;
        isHost = asHost;
        connectionStatusEl.textContent = '初期化中...';
        
        try {
            const res = await fetch('https://command-battle-online2-8j5m.vercel.app/api/token');
            const { token } = await res.json();
            if (!token) throw new Error('トークンの取得に失敗しました。');

            context = await SkyWayContext.Create(token);
            
            if (isHost) {
                const roomId = generateUuidV4();
                room = await context.joinRoom({ name: `game_room_${roomId}`, mode: 'p2p' });
                myPeerIdEl.textContent = room.name;
                connectionStatusEl.textContent = `ルームID: ${room.name} を作成しました。相手の参加を待っています...`;
            } else {
                room = await context.joinRoom({ name: peerIdInput.value, mode: 'p2p' });
                connectionStatusEl.textContent = '接続中...';
            }

            localPerson = await room.join();
            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);

            // メンバー入室時、またはストリーム公開時にデータストリームを購読
            room.onMemberJoined.add(async (e) => {
                logMessage('対戦相手が入室しました。');
                for (const publication of e.member.publications) {
                    if (publication.contentType === 'data') {
                        const subscription = await localPerson.subscribe(publication.id);
                        handleDataStream(subscription.stream);
                        logMessage('✅ 相手のデータストリームを購読しました。', 'success');
                        proceedToPartyBtn.classList.remove('hidden');
                    }
                }
            });
            room.onStreamPublished.add(async ({ publication }) => {
                if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                    const subscription = await localPerson.subscribe(publication.id);
                    handleDataStream(subscription.stream);
                    logMessage('✅ 相手のデータストリームを購読しました。', 'success');
                    proceedToPartyBtn.classList.remove('hidden');
                }
            });
            
            if (!isHost) {
                // クライアントの場合、参加できたらボタン表示
                proceedToPartyBtn.classList.remove('hidden');
                logMessage('🎉 ルームへの接続が完了しました！', 'success');
            }

        } catch (error) {
            console.error('Failed to initialize SkyWay:', error);
            connectionStatusEl.textContent = 'エラー: ' + (error.message || '初期化に失敗しました');
            logMessage('エラー: 初期化に失敗しました。詳細をコンソールで確認してください。', 'error');
            await cleanupSkyWay();
        }
    }
    
    async function connectToRoom(remoteRoomId) {
        isHost = false;
        await initializeSkyWay(false);
    }
    
    // 両者がパーティーを決定したかチェックする
    function checkBothReady() {
        if (myPartyReady && opponentPartyReady) {
            // ホストのみが戦闘開始信号を送る
            if (isHost) {
                logMessage('両者の準備が整いました。戦闘を開始します！', 'success');
                window.sendData({ type: 'start_battle' });
                window.startOnlineBattle();
            }
        }
    }

    // データストリームの受信ハンドラ
    function handleDataStream(stream) {
        stream.onData.add(({ data }) => {
            if (!data) {
                console.warn('Received empty or invalid data:', data);
                return;
            }
            try {
                const parsedData = JSON.parse(data);
                console.log('Received data:', parsedData);

                if (parsedData.type === 'party_data') {
                    window.handleOpponentParty(parsedData.party);
                } else if (parsedData.type === 'party_ready') {
                    opponentPartyReady = true;
                    logMessage('相手がパーティーを決定しました！', 'info');
                    checkBothReady();
                } else if (parsedData.type === 'start_battle') {
                    window.startOnlineBattle();
                } else if (parsedData.type === 'log_message') {
                    window.logMessage(parsedData.message, parsedData.messageType);
                } else if (parsedData.type === 'request_action') {
                    window.handleBattleAction(parsedData);
                } else if (parsedData.type === 'execute_action') {
                    window.handleBattleAction(parsedData);
                } else if (parsedData.type === 'action_result') {
                    window.handleBattleAction(parsedData);
                } else if (parsedData.type === 'sync_game_state') {
                    window.handleBattleAction(parsedData);
                } else if (parsedData.type === 'battle_end') {
                    window.handleBattleAction(parsedData);
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
            if (localPerson) { await localPerson.leave(); localPerson = null; }
            if (dataStream) { dataStream = null; }
            if (room) { await room.close(); room = null; }
            if (context) { context.dispose(); context = null; }
        } catch (err) {
            console.warn("⚠️ cleanupSkyWay エラー (無視してOK):", err);
        }
        myPartyReady = false;
        opponentPartyReady = false;
    }

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
    window.isOnlineMode = () => isOnlineMode;
    window.isHost = () => isHost;
});