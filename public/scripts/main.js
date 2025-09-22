// main.js (SkyWay対応版)

// SkyWay SDKはグローバル変数として読み込まれる
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

    startButton.addEventListener('click', () => {
        isOnlineMode = false;
        titleScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
    });

    onlineButton.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        onlineScreen.classList.remove('hidden');
        initializeSkyWay();
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
        isHost = false;
        isOnlineMode = false;
    });

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

    connectButton.addEventListener('click', async () => {
        const remoteRoomId = peerIdInput.value;
        if (remoteRoomId) {
            await connectToRoom(remoteRoomId);
        } else {
            alert('接続先のIDを入力してください。');
        }
    });

    copyIdButton.addEventListener('click', () => {
        const roomId = myPeerIdEl.textContent;
        navigator.clipboard.writeText(roomId)
            .then(() => alert('IDがクリップボードにコピーされました！'))
            .catch(err => console.error('コピーに失敗しました', err));
    });

    // SkyWayを初期化し、ホストとしてルームを作成する
    async function initializeSkyWay() {
        if (context) return;
        isOnlineMode = true;
        connectionStatusEl.textContent = '初期化中...';
        copyIdButton.disabled = true;

        try {
            const res = await fetch('https://command-battle-online2-3p3l.vercel.app/api/token');
            const { token } = await res.json();
            
            context = await SkyWayContext.Create(token);

            // ルーム名にUUIDv4を使用
            const roomId = generateUuidV4();
            room = await context.joinRoom({
                name: `game_room_${roomId}`,
                type: 'sfu',
            });

            isHost = true;
            localPerson = room.localPerson;
            myPeerIdEl.textContent = room.name;
            connectionStatusEl.textContent = 'ルームID: ' + room.name;
            logMessage('ホストとしてルームを作成しました。対戦相手の参加を待っています...');
            copyIdButton.disabled = false;

            // データストリームのパブリッシュ
            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);

            // 相手が参加したら購読
            room.onPersonJoined.once(async ({ person }) => {
                logMessage('対戦相手が入室しました。');
                
                // 相手がパブリッシュするデータストリームを待機して購読
                const { stream } = await person.subscribe({ contentType: 'data' });
                handleDataStream(stream);
            });
            
        } catch (error) {
            console.error('Failed to initialize SkyWay:', error);
            connectionStatusEl.textContent = 'エラー: 初期化に失敗しました';
        }
    }

    // クライアントとして既存のルームに参加する
    async function connectToRoom(roomId) {
        if (context) return;
        isOnlineMode = true;
        connectionStatusEl.textContent = '接続中...';

        try {
            const res = await fetch('https://command-battle-online2-3p3l.vercel.app/api/token');
            const { token } = await res.json();
            
            context = await SkyWayContext.Create(token);

            room = await context.joinRoom({
                name: roomId,
            });

            if (!room) {
                alert('指定されたルームが見つかりません。');
                cleanupSkyWay();
                return;
            }

            isHost = false;
            localPerson = room.localPerson;
            myPeerIdEl.textContent = room.name;
            connectionStatusEl.textContent = 'ルームID: ' + room.name;
            copyIdButton.disabled = false;
            logMessage('ルームに参加しました。');

            // データストリームのパブリッシュ
            dataStream = await SkyWayStreamFactory.createDataStream();
            await localPerson.publish(dataStream);

            // 相手がパブリッシュしたストリームを待機して購読
            room.onPublicationListChanged.add(() => {
                room.publications.forEach(async (publication) => {
                    if (publication.contentType === 'data' && publication.publisher.id !== localPerson.id) {
                        const { stream } = await localPerson.subscribe(publication.id);
                        handleDataStream(stream);
                    }
                });
            });

        } catch (error) {
            console.error('Failed to connect to room:', error);
            connectionStatusEl.textContent = 'エラー: 接続に失敗しました';
        }
    }

    function handleDataStream(stream) {
        stream.onData.add(({ data }) => {
            try {
                const parsedData = JSON.parse(data);
                console.log('Received data:', parsedData);
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
                console.error('Failed to parse received data:', error);
            }
        });
    }

    async function cleanupSkyWay() {
        if (room) {
            room.close();
            room = null;
        }
        if (context) {
            context.dispose();
            context = null;
        }
        localPerson = null;
        dataStream = null;
        isOnlineMode = false;
        connectionStatusEl.textContent = '未接続';
    }

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

    window.isOnlineMode = function () {
        return isOnlineMode;
    };

    window.isHost = function () {
        return isHost;
    };
});