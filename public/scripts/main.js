// main.js (Pusher版 - 最終版)

const PUSHER_APP_KEY = 'a2fd55b8bc4f266ae242';
const PUSHER_CLUSTER = 'ap3';

let pusher = null;
let channel = null;
let isOnlineMode = false;
let myRoomId = null;

// グローバルにアクセス可能な変数と関数
window.isOnlineMode = () => isOnlineMode;
window.isHost = () => channel && channel.name === myRoomId;

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

    // ホストの場合、ログをクライアントに送信 (ホスト側では二重表示しない)
    if (window.isOnlineMode() && window.isHost() && type !== 'from-host') {
        window.sendData('log_message', { message: message, messageType: type });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const backButton = document.getElementById('back-button');
    const goButton = document.getElementById('go-button');
    const onlineButton = document.getElementById('online-button');
    const backToTitleButton = document.getElementById('back-to-title-button');
    const showHostUiButton = document.getElementById('show-host-ui-button');
    const showClientUiButton = document.getElementById('show-client-ui-button');
    const connectButton = document.getElementById('connect-button');
    const startHostConnectionButton = document.getElementById('start-host-connection-button');
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
        cleanupPusher();
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
        const roomId = 'private-' + Math.random().toString(36).substring(2, 9);
        myRoomId = roomId;
        myPeerIdEl.textContent = myRoomId.replace('private-', '');
        copyIdButton.disabled = false;
        connectionStatusEl.textContent = 'ルームIDを相手に伝えて、「接続を開始」ボタンを押してください。';
    });

    if (startHostConnectionButton) {
        startHostConnectionButton.addEventListener('click', () => {
            if (myRoomId) {
                connectionStatusEl.textContent = '相手の接続を待っています...';
                connectToPusher(myRoomId);
            } else {
                alert('ルームIDがありません。一度タイトルに戻ってやり直してください。');
            }
        });
    }

    showClientUiButton.addEventListener('click', () => {
        modeSelection.classList.add('hidden');
        clientUi.classList.remove('hidden');
        connectionStatusEl.textContent = '相手のルームIDを入力してください';
    });

    backToTitleButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        cleanupPusher();
    });

    goButton.addEventListener('click', () => {
        const selectedParty = window.getSelectedParty();
        if (!selectedParty || selectedParty.length !== 4) {
            window.logMessage('パーティーメンバーを4人選択してください。', 'error');
            return;
        }

        if (isOnlineMode) {
            if (!pusher || pusher.connection.state !== 'connected') {
                logMessage('Pusherの接続が完了していません。接続状態を確認してください。', 'error');
                return;
            }

            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');

            // initializePlayerPartyは、party_readyを送る前に呼ぶ
            window.initializePlayerParty(selectedParty);

            // 送信するデータをキャラクターのIDリストに限定
            const partyToSend = selectedParty.map(member => member.originalId);

            // ホストとしてルームを作成した場合
            if (window.isHost()) {
                window.logMessage("ホストとしてパーティーを準備しました。相手の準備を待っています...", "info");
                window.sendData('party_ready', { party: partyToSend });
            } else {
                window.logMessage("クライアントとしてパーティーを準備しました。ホストに通知します...", "info");
                window.sendData('client_party_ready', { party: partyToSend });
            }
        } else {
            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');
            window.startBattle(selectedParty);
        }
    });

    connectButton.addEventListener('click', () => {
        const remoteRoomId = 'private-' + peerIdInput.value;
        if (remoteRoomId && peerIdInput.value.length > 0) {
            myRoomId = remoteRoomId;
            connectToPusher(remoteRoomId);
            connectionStatusEl.textContent = '接続中...';
        } else {
            alert('接続先のIDを入力してください。');
        }
    });

    copyIdButton.addEventListener('click', () => {
        if (myRoomId) {
            navigator.clipboard.writeText(myRoomId.replace('private-', ''))
                .then(() => alert('IDがクリップボードにコピーされました！'))
                .catch(err => console.error('コピーに失敗しました', err));
        }
    });

    onlinePartyGoButton.addEventListener('click', () => {
        onlineScreen.classList.add('hidden');
        partyScreen.classList.remove('hidden');
        goButton.disabled = false;
    });

    function connectToPusher(roomId) {
        // 既存の接続がある場合は、まず切断してから再接続する
        if (pusher && pusher.connection.state !== 'disconnected') {
            console.warn('既存のPusher接続を切断します。');
            cleanupPusher();
        }

        isOnlineMode = true;

        pusher = new Pusher(PUSHER_APP_KEY, {
            cluster: PUSHER_CLUSTER,
            forceTLS: true,
            channelAuthorization: {
                endpoint: 'https://command-battle-online2-8j5m.vercel.app/api/pusher-auth',
            },
        });

        pusher.connection.bind('connected', () => {
            console.log('Pusher接続成功');
        });

        pusher.connection.bind('error', (err) => {
            console.error('Pusher接続エラー:', err);
            window.logMessage('Pusherへの接続に失敗しました。', 'error');
            cleanupPusher();
        });

        channel = pusher.subscribe(roomId);

        channel.bind('pusher:subscription_succeeded', () => {
            console.log('チャンネル購読成功');
            connectionStatusEl.textContent = '✅ 接続完了！';
            onlinePartyGoButton.classList.remove('hidden');
            if (window.isHost()) {
                window.sendData('connection_established', {});
            }
        });

        channel.bind('pusher:subscription_error', (status) => {
            console.error('チャンネル購読エラー:', status);
            window.logMessage('チャンネルへの接続に失敗しました。ルームIDを確認してください。', 'error');
            cleanupPusher();
        });

        channel.bind('client-connection_established', () => {
            onlinePartyGoButton.classList.remove('hidden');
            if (!window.isHost()) {
                window.sendData('connection_established', {});
            }
        });

        // ホスト側は自分が送ったメッセージを処理しないように修正
        channel.bind('client-party_ready', (data) => {
            // ホストの場合、クライアントから送られてきたパーティー情報を処理
            if (window.isHost()) {
                window.handleOpponentParty(data.party);
            }
        });

        channel.bind('client-log_message', (data) => {
            // ホストからのログを受信して表示
            const p = document.createElement('p');
            p.textContent = data.message;
            if (data.messageType) {
                p.classList.add('log-message', data.messageType);
            }
            const messageLogEl = document.getElementById('message-log');
            if (messageLogEl) {
                messageLogEl.appendChild(p);
                messageLogEl.scrollTop = messageLogEl.scrollHeight;
            }
        });

        channel.bind('client-start_battle', (data) => {
            window.startOnlineBattleClientSide(data.initialState);
        });

        channel.bind('client-request_action', (data) => {
            window.handleActionRequest(data);
        });

        channel.bind('client-execute_action', (data) => {
            window.executeAction(data);
        });

        channel.bind('client-sync_game_state', (data) => {
            // 修正後のロジック: battle.jsで定義された関数を呼び出す
            window.syncGameStateClientSide(data);
        });

        // ホスト側でクライアントからの準備完了イベントを待機
        channel.bind('client_party_ready', (data) => {
            if (window.isHost()) {
                window.logMessage("クライアントが準備完了しました。", "info");
                // キャラクターIDリストからパーティーを再構築
                const clientParty = window.createPartyFromIds(data.party);
                const hostParty = window.getPlayerParty();

                // 戦闘状態の初期化
                const initialState = window.startOnlineBattle(hostParty, clientParty);

                // 全員に戦闘開始を通知
                window.sendData('client-start_battle', { initialState: initialState });
            }
        });

        // クライアント側はすでに存在する 'party_ready' イベントでホストのパーティーを受信
        channel.bind('party_ready', (data) => {
            if (!window.isHost()) {
                window.handleOpponentParty(data.party); // ホストのパーティー情報を保存
                window.logMessage("ホストが準備完了しました。");
                // ここで、クライアント側は自分のパーティー情報をホストに送り返す必要はありません。
                // なぜならgoButtonのロジックで既に送っているからです。
                // このイベントは情報を受け取るだけにします。
            }
        });
    }

    function cleanupPusher() {
        if (pusher) {
            pusher.disconnect();
        }
        pusher = null;
        channel = null;
        isOnlineMode = false;
        myRoomId = null;

        onlinePartyGoButton.classList.add('hidden');
        myPeerIdEl.textContent = '';
        connectionStatusEl.textContent = '';
        peerIdInput.value = '';
        goButton.disabled = false;
    }


    window.sendData = function (eventType, data) {
        if (!channel) {
            return false;
        }

        const eventName = `client-${eventType}`;

        try {
            channel.trigger(eventName, data);
            return true;
        } catch (error) {
            return false;
        }
    };
});