// main.js (オンライン同期強化版)
const PUSHER_APP_KEY = 'a2fd55b8bc4f266ae242';
const PUSHER_CLUSTER = 'ap3';

let pusher = null;
let channel = null;
let isOnlineMode = false;
let myRoomId = null;

window.isOnlineMode = () => isOnlineMode;
window.isHost = () => channel && channel.name === myRoomId;

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
    const backButton = document.getElementById('back-button');
    const goButton = document.getElementById('go-button');
    const onlineButton = document.getElementById('online-button');
    const backToTitleButton = document.getElementById('back-to-title-button');
    const showHostUiButton = document.getElementById('show-host-ui-button');
    const showClientUiButton = document.getElementById('show-client-ui-button');
    const connectButton = document.getElementById('connect-button');
    const startHostConnectionButton = document.getElementById('start-host-connection-button'); // 追加
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
        if (!selectedParty) {
            window.logMessage('パーティーメンバーを4人選択してください。', 'error');
            return;
        }

        if (isOnlineMode) {
            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');

            window.initializePlayerParty(selectedParty);
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

            window.sendData('party_ready', { party: partyDataForSend });
            window.logMessage('パーティー情報を送信しました。相手の準備を待っています...');
        } else {
            partyScreen.classList.add('hidden');
            battleScreen.classList.remove('hidden');
            window.startBattle(selectedParty);
        }
    });

    connectButton.addEventListener('click', () => {
        const remoteRoomId = 'private-' + peerIdInput.value;
        if (remoteRoomId) {
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
        if (pusher) return;
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
            // 接続完了後、ホストがクライアントへ接続完了を通知する
            if (window.isHost()) {
                window.sendData('connection_established', {});
            }
        });

        channel.bind('pusher:subscription_error', (status) => {
            console.error('チャンネル購読エラー:', status);
            window.logMessage('チャンネルへの接続に失敗しました。ルームIDを確認してください。', 'error');
            cleanupPusher();
        });

        // ★★★ 修正箇所: 各イベントを個別に購読するように変更 ★★★
        channel.bind('client-connection_established', (data) => {
            console.log('Received data: client-connection_established', data);
            onlinePartyGoButton.classList.remove('hidden');
            if (!window.isHost()) {
                window.sendData('connection_established', {});
            }
        });

        channel.bind('client-party_ready', (data) => {
            console.log('相手のパーティー情報を受信:', data.party);
            window.logMessage('対戦相手のパーティー情報を受信しました！');
            window.handleOpponentParty(data.party);
        });

        channel.bind('client-log_message', (data) => {
            window.logMessage(data.message, data.messageType);
        });

        channel.bind('client-execute_action', (data) => {
            window.executeAction(data);
        });

        channel.bind('client-sync_game_state', (data) => {
            window.handleBattleAction(data);
        });

        channel.bind('client-battle_end', (data) => {
            window.handleBattleAction(data);
        });

        channel.bind('client-start_battle', (data) => {
            window.handleBattleAction(data);
        });
        // ★★★ 修正箇所ここまで ★★★
    }

    function cleanupPusher() {
        console.log("🧹 cleanupPusher 実行");
        if (channel) {
            channel.unbind();
            pusher.unsubscribe(channel.name);
        }
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
        console.log("✅ cleanupPusher 完了");
    }

    window.sendData = function (eventType, data) {
        if (!channel || channel.name.startsWith('presence-')) {
            console.warn('チャンネルがまだ準備できていないか、許可されていないタイプです。');
            return false;
        }

        const eventName = `client-${eventType}`;

        try {
            channel.trigger(eventName, data);
            console.log('Sent data:', eventName, data);
            return true;
        } catch (error) {
            console.error('データ送信に失敗しました:', error);
            return false;
        }
    };
});