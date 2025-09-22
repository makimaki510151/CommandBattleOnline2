// main.js (SkyWay対応版)

// SkyWay SDKはグローバル変数として読み込まれる
const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory, RoomPublication } = window.skyway_room;

let context = null;
let room = null;
let localMember = null;
let dataStream = null;
let isHost = false;
let isOnlineMode = false;
let remoteMember = null;

// ハードコードされたAPP_IDは不要になるため削除します
// const APP_ID = 'd5450488-422b-47bf-93a0-baa8d2d3316c';


document.addEventListener('DOMContentLoaded', () => {
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

    // 「オンライン対戦」ボタン
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

    // 「出かける」ボタン
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

    // 「接続」ボタン
    connectButton.addEventListener('click', () => {
        const remotePeerId = peerIdInput.value;
        if (remotePeerId) {
            connectToRoom(remotePeerId);
        } else {
            alert('接続先のIDを入力してください。');
        }
    });

    // 「IDをコピー」ボタン
    copyIdButton.addEventListener('click', () => {
        const peerId = myPeerIdEl.textContent;
        navigator.clipboard.writeText(peerId)
            .then(() => alert('IDがクリップボードにコピーされました！'))
            .catch(err => console.error('コピーに失敗しました', err));
    });

    // SkyWayを初期化し、ホストとしてルームを作成する
    async function initializeSkyWay() {
        if (context) return;
        isOnlineMode = true;
        connectionStatusEl.textContent = '初期化中...';

        try {
            // 修正箇所: サーバーレス関数からトークンとアプリIDを同時に取得します
            const res = await fetch('https://command-battle-online2-3p3l.vercel.app/api/token');
            const { token, appId } = await res.json();
            
            // 修正箇所: 取得したappIdをSkyWayContext.Createの第2引数に渡します
            context = await SkyWayContext.Create(token, appId);

            const uuid = generateUuidV4();
            room = await SkyWayRoom.FindOrCreate(context, {
                name: `game_room_${uuid}`,
                type: 'sfu',
            });

            isHost = true;
            localMember = room.localPerson;
            myPeerIdEl.textContent = localMember.id;
            connectionStatusEl.textContent = 'ルームID: ' + uuid;
            logMessage('ホストとしてルームを作成しました。対戦相手の参加を待っています...');

            // データストリームのパブリッシュ
            const dataStream = await SkyWayStreamFactory.createDataStream();
            await room.publish(dataStream);

            // 相手の入室を待つ
            room.onPersonJoined.once(() => {
                logMessage('対戦相手が入室しました。');
            });

            // 相手がデータを送ってきたら受け取る
            room.onStreamPublished.add(async ({ publication }) => {
                if (publication.contentType === 'data' && publication.publisher.id !== localMember.id) {
                    const { stream } = await localMember.subscribe(publication);
                    handleDataStream(stream);
                }
            });

        } catch (error) {
            console.error('Failed to initialize SkyWay:', error);
            connectionStatusEl.textContent = 'エラー: 初期化に失敗しました';
        }
    }

    // クライアントとして既存のルームに参加する
    async function connectToRoom(uuid) {
        if (context) return;
        isOnlineMode = true;
        connectionStatusEl.textContent = '接続中...';
        try {
            // 修正箇所: サーバーレス関数からトークンとアプリIDを同時に取得します
            const res = await fetch('https://command-battle-online2-3p3l.vercel.app/api/token');
            const { token, appId } = await res.json();

            // 修正箇所: 取得したappIdをSkyWayContext.Createの第2引数に渡します
            context = await SkyWayContext.Create(token, appId);
            
            room = await SkyWayRoom.FindOrCreate(context, {
                name: `game_room_${uuid}`,
                type: 'sfu',
            });

            isHost = false;
            localMember = room.localPerson;
            myPeerIdEl.textContent = localMember.id;
            connectionStatusEl.textContent = '接続済み';
            logMessage('ホストのルームに参加しました。');

            // データストリームのパブリッシュ
            const dataStream = await SkyWayStreamFactory.createDataStream();
            await room.publish(dataStream);

            // 相手がデータを送ってきたら受け取る
            room.onStreamPublished.add(async ({ publication }) => {
                if (publication.contentType === 'data' && publication.publisher.id !== localMember.id) {
                    const { stream } = await localMember.subscribe(publication);
                    handleDataStream(stream);
                }
            });

            // ホストのパーティーデータが届くのを待つ
            logMessage('ホストのパーティー情報を待機中...');

        } catch (error) {
            console.error('Failed to connect to room:', error);
            connectionStatusEl.textContent = 'エラー: 接続に失敗しました';
        }
    }

    // データストリームの受信処理
    function handleDataStream(stream) {
        dataStream = stream;
        dataStream.onData.add(({ data }) => {
            const parsedData = JSON.parse(data);
            console.log('Received data:', parsedData);
            if (parsedData.type === 'party_data') {
                window.handleOpponentParty(parsedData.party);
            }
            if (parsedData.type === 'start_battle') {
                window.startBattleClientSide();
            }
            if (parsedData.type === 'game_state_update') {
                window.handleGameStateUpdate(parsedData.data);
            }
            if (parsedData.type === 'log_message') {
                window.logMessage(parsedData.message, parsedData.messageType);
            }
        });
    }

    // SkyWayのリソースをクリーンアップ
    async function cleanupSkyWay() {
        if (room) {
            await room.close();
            room = null;
        }
        if (context) {
            await context.dispose();
            context = null;
        }
        localMember = null;
        dataStream = null;
        remoteMember = null;
        isOnlineMode = false;
        connectionStatusEl.textContent = '未接続';
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

    // オンラインモード判定をグローバルに公開
    window.isOnlineMode = function () {
        return isOnlineMode;
    };

    // ホスト判定をグローバルに公開
    window.isHost = function () {
        return isHost;
    };

    // `battle.js`から呼び出せるようにする
    window.logMessage = (message, type) => {
        const p = document.createElement('p');
        p.textContent = message;
        if (type) {
            p.classList.add('log-message', type);
        }
        document.getElementById('message-log').appendChild(p);
        document.getElementById('message-log').scrollTop = document.getElementById('message-log').scrollHeight;
    };
});


// UUID v4を生成する関数
function generateUuidV4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}