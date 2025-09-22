// main.js (修正版)

let peer = null;
let connection = null;
let isHost = false;
let isOnlineMode = false;

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
        initializePeer();
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
    backToTitleButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        if (peer) {
            peer.destroy();
            peer = null;
        }
        if (connection) {
            connection.close();
            connection = null;
        }
        isHost = false;
        isOnlineMode = false;
    });

    // 「出かける」ボタン
    startAdventureButton.addEventListener('click', () => {
        const partyMembers = window.getSelectedParty();
        if (partyMembers.length < 1) { // 1人以上で編成可能に変更（テスト用）
            alert('パーティーは1人以上で編成してください。');
            return;
        }

        partyScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');

        window.startBattle(partyMembers);
    });

    // 「接続」ボタン
    connectButton.addEventListener('click', () => {
        const targetId = peerIdInput.value.trim();
        if (!targetId) {
            alert('相手のIDを入力してください。');
            return;
        }
        connectToPeer(targetId);
    });

    // 「IDをコピー」ボタン
    copyIdButton.addEventListener('click', () => {
        navigator.clipboard.writeText(myPeerIdEl.textContent).then(() => {
            alert('IDをクリップボードにコピーしました！');
        });
    });

    // PeerJSの初期化
    function initializePeer() {
        connectionStatusEl.textContent = 'PeerJSを初期化中...';
        try {
            peer = new Peer();
        } catch (error) {
            console.error('PeerJS initialization failed:', error);
            alert('PeerJSの初期化に失敗しました。コンソールを確認してください。');
            return;
        }

        peer.on('open', (id) => {
            myPeerIdEl.textContent = id;
            connectionStatusEl.textContent = '接続待機中...';
            connectButton.disabled = false;
            copyIdButton.disabled = false;
        });

        peer.on('connection', (conn) => {
            if (connection) { // 既に接続がある場合は新しい接続を拒否
                conn.close();
                return;
            }
            connection = conn;
            isHost = false; // 接続を受けた側はクライアント
            setupConnection();
        });

        peer.on('error', (err) => {
            console.error('Peer Error:', err);
            connectionStatusEl.textContent = 'エラーが発生しました: ' + err.message;
        });
    }

    // 相手に接続
    function connectToPeer(targetId) {
        connectionStatusEl.textContent = '接続中...';
        connection = peer.connect(targetId);
        isHost = true; // 接続を開始した側はホスト
        setupConnection();
    }

    // 接続の設定
    function setupConnection() {
        connection.on('open', () => {
            connectionStatusEl.textContent = '接続完了！パーティー編成に進んでください。';
            isOnlineMode = true;

            // パーティー編成画面に移動するボタンを表示
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

            const existingButton = document.querySelector('.online-controls .proceed-button');
            if (!existingButton) {
                document.querySelector('.online-controls').appendChild(proceedButton);
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

    // 受信データの処理（統一化）
    function handleReceivedData(data) {
        console.log('Received data:', data);

        // CustomEventを発行してbattle.jsで処理できるようにする
        const event = new CustomEvent('data_received', { detail: data });
        window.dispatchEvent(event);

        switch (data.type) {
            case 'party_data':
                // 相手のパーティー情報を受信
                if (window.handleOpponentParty) {
                    window.handleOpponentParty(data.party);
                }
                break;
                
            case 'start_battle':
                // ホストからの戦闘開始通知を受信した場合
                if (window.isOnlineMode() && !window.isHost()) {
                    window.startBattleClientSide();
                }
                break;
                
            case 'request_action':
            case 'execute_action':
            case 'action_result':
            case 'sync_game_state':
            case 'log_message':
            case 'battle_end':
                // 統一されたアクション処理システム
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
        if (connection && connection.open) {
            // functionタイプのプロパティを除外してシリアライズ
            const serializedData = JSON.parse(JSON.stringify(data, (key, value) => {
                if (typeof value === 'function') {
                    return undefined; // functionタイプは除外
                }
                return value;
            }));
            connection.send(serializedData);
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
