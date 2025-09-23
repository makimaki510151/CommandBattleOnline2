// main.js
let ws = null;
let isHost = false;
let isOnlineMode = false;
let roomId = '';

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const onlineButton = document.getElementById('online-button');
    const backButton = document.getElementById('back-button');
    const startAdventureButton = document.getElementById('go-button');
    const onlineBattleGoButton = document.getElementById('online-battle-go-button');

    const hostModeButton = document.getElementById('host-mode-button');
    const joinModeButton = document.getElementById('join-mode-button');
    const hostControls = document.getElementById('host-controls');
    const joinControls = document.getElementById('join-controls');
    const onlineModeSelect = document.getElementById('online-mode-select');

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
    const goButton = document.getElementById('go-button');

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
    });

    // ホストモード選択
    hostModeButton.addEventListener('click', async () => {
        onlineModeSelect.classList.add('hidden');
        hostControls.classList.remove('hidden');
        isHost = true;
        isOnlineMode = true;
        await initializeWebSocket();
    });

    // 参加者モード選択
    joinModeButton.addEventListener('click', () => {
        onlineModeSelect.classList.add('hidden');
        joinControls.classList.remove('hidden');
        isHost = false;
        isOnlineMode = true;
        connectButton.disabled = false;
        peerIdInput.addEventListener('input', () => {
            connectButton.disabled = peerIdInput.value.length === 0;
        });
    });

    // 接続ボタン
    connectButton.addEventListener('click', async () => {
        const targetId = peerIdInput.value;
        if (targetId) {
            connectionStatusEl.textContent = '接続中...';
            await initializeWebSocket(targetId);
        }
    });

    // IDをコピーボタン
    copyIdButton.addEventListener('click', () => {
        if (myPeerIdEl.textContent) {
            navigator.clipboard.writeText(myPeerIdEl.textContent);
            connectionStatusEl.textContent = 'IDをコピーしました！';
        }
    });

    // 戻るボタン
    backButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        if (ws) {
            ws.close();
        }
    });

    // タイトルへ戻るボタン（パーティ画面から）
    backToTitleButton.addEventListener('click', () => {
        partyScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        if (ws) {
            ws.close();
        }
    });

    // 冒険開始ボタン（シングルプレイ）
    startAdventureButton.addEventListener('click', () => {
        if (window.startBattle) {
            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');
            window.startBattle();
        }
    });
    
    // オンラインバトル開始ボタン
    onlineBattleGoButton.addEventListener('click', () => {
        if (window.startOnlineBattle) {
            partyScreen.classList.add('hidden');
            onlineScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');
            window.startOnlineBattle();
        }
    });

    async function initializeWebSocket(targetId = null) {
        connectionStatusEl.textContent = '接続中...';
        
        try {
            const response = await fetch('https://command-battle-online2-8j5m.vercel.app/api/token');
            const data = await response.json();
            const token = data.token;
            
            ws = new WebSocket('wss://command-battle-online2-8j5m.vercel.app/ws?token=' + token);
            
            ws.onopen = () => {
                connectionStatusEl.textContent = '接続完了。';
                if (isHost) {
                    ws.send(JSON.stringify({ type: 'createRoom' }));
                } else if (targetId) {
                    ws.send(JSON.stringify({ type: 'joinRoom', roomId: targetId }));
                }
            };
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                handleReceivedData(data);
            };

            ws.onclose = () => {
                connectionStatusEl.textContent = '接続が切断されました。';
                onlineBattleGoButton.classList.add('hidden');
            };

            ws.onerror = (error) => {
                console.error('WebSocket Error:', error);
                connectionStatusEl.textContent = '接続エラーが発生しました。';
            };
            
        } catch (error) {
            console.error('通信エラー:', error);
            connectionStatusEl.textContent = '通信エラーが発生しました。';
        }
    }

    function handleReceivedData(data) {
        switch (data.type) {
            case 'roomCreated':
                roomId = data.roomId;
                myPeerIdEl.textContent = roomId;
                copyIdButton.disabled = false;
                connectionStatusEl.textContent = 'ルームが作成されました。相手の接続を待っています...';
                break;
            case 'roomJoined':
                roomId = data.roomId;
                if (!isHost) {
                    myPeerIdEl.textContent = roomId;
                    copyIdButton.disabled = false;
                }
                connectionStatusEl.textContent = `相手がルームに参加しました！`;
                // 接続が確立したら、パーティ選択画面に遷移
                onlineBattleGoButton.classList.remove('hidden');
                goButton.disabled = true; // シングルプレイのGOボタンを無効化
                titleScreen.classList.add('hidden');
                partyScreen.classList.remove('hidden');
                break;
            case 'partyReady':
            case 'playerAction':
            case 'syncGameState':
            case 'logMessage':
            case 'battleEnd':
                if (window.handleBattleAction) {
                    window.handleBattleAction(data);
                }
                break;
            default:
                console.log('Unknown data type received:', data.type);
                break;
        }
    }

    // データ送信関数をグローバルに公開
    window.sendData = function (data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const serializedData = JSON.stringify(data, (key, value) => {
                if (typeof value === 'function') {
                    return undefined; // functionタイプは除外
                }
                return value;
            });
            ws.send(serializedData);
            console.log('Sent data:', serializedData);
        } else {
            console.warn('Connection not available for sending data');
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
});
