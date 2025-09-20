// main.js

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
        if (partyMembers.length !== 4) {
            alert('パーティーは4人で編成してください。');
            return;
        }

        // オンライン対戦の場合、パーティーデータを相手に送信
        if (isOnlineMode && connection && connection.open) {
            window.sendData({
                type: 'party_data',
                party: partyMembers
            });
            console.log('パーティーデータを送信しました:', partyMembers);
        }

        partyScreen.classList.add('hidden');
        battleScreen.classList.remove('hidden');
        
        window.startBattle(); // 戦闘開始
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

    // SKYWAYの初期化
    function initializePeer() {
        connectionStatusEl.textContent = 'SKYWAYを初期化中...';
        
        // SKYWAYを使用してPeerを初期化（APIキーなしで試行）
        try {
            peer = new Peer();
        } catch (error) {
            console.error('SKYWAY initialization failed, falling back to PeerJS:', error);
            // フォールバック: PeerJSを使用
            peer = new Peer();
        }

        peer.on('open', (id) => {
            myPeerIdEl.textContent = id;
            connectionStatusEl.textContent = '接続待機中...';
            connectButton.disabled = false;
            copyIdButton.disabled = false;
        });

        peer.on('connection', (conn) => {
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
            
            // ホバー効果を追加
            proceedButton.addEventListener('mouseenter', () => {
                proceedButton.style.transform = 'translateY(-3px) scale(1.05)';
                proceedButton.style.boxShadow = '0 12px 24px rgba(255, 107, 53, 0.4)';
            });
            
            proceedButton.addEventListener('mouseleave', () => {
                proceedButton.style.transform = 'translateY(0) scale(1)';
                proceedButton.style.boxShadow = '0 8px 16px rgba(255, 107, 53, 0.3)';
            });
            
            const existingButton = document.querySelector('.online-controls button[style*="margin-top"]');
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

    // 受信データの処理
    function handleReceivedData(data) {
        console.log('Received data:', data);
        
        switch (data.type) {
            case 'party_data':
                // 相手のパーティー情報を受信
                if (window.handleOpponentParty) {
                    window.handleOpponentParty(data.party);
                }
                break;
            case 'battle_action':
                // 戦闘中の行動データ
                if (window.handleBattleAction) {
                    window.handleBattleAction(data);
                }
                break;
            case 'dodge_result':
                // 回避判定結果
                if (window.handleDodgeResult) {
                    window.handleDodgeResult(data);
                }
                break;
            case 'critical_result':
                // 会心判定結果
                if (window.handleCriticalResult) {
                    window.handleCriticalResult(data);
                }
                break;
            case 'game_state':
                // ゲーム状態の同期
                if (window.syncGameState) {
                    window.syncGameState(data);
                }
                break;
        }
    }

    // データ送信関数をグローバルに公開
    window.sendData = function(data) {
        if (connection && connection.open) {
            // function型のプロパティを除外してシリアライズ
            const serializedData = JSON.parse(JSON.stringify(data, (key, value) => {
                if (typeof value === 'function') {
                    return undefined; // function型は除外
                }
                return value;
            }));
            connection.send(serializedData);
        }
    };

    // オンラインモード判定をグローバルに公開
    window.isOnlineMode = function() {
        return isOnlineMode;
    };

    // ホスト判定をグローバルに公開
    window.isHost = function() {
        return isHost;
    };
});

