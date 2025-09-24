// main.js (手動SDP交換版 - UI表示)
import { characters } from './characters.js';
// グローバル変数と定数
const STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.ekiga.net' },
    { urls: 'stun:stun.xten.com' }
];

let peerConnection = null;
let dataChannel = null;
let isOnlineMode = false;
let isHost = false;

// グローバルスコープでDOM要素を宣言
let onlinePartyGoButton;
let myPeerIdEl;
let connectionStatusEl;
let peerIdInput;
let goButton;
let hostUiEl;
let clientUiEl;
let showHostUiButton;
let showClientUiButton;
let startHostConnectionButton;
let connectButton;
let onlineScreen;
let messageLogEl;
let copyIdButton;

// ホスト側のUI要素
let peerIdInputHost;
let connectButtonHost;

// クライアント側のUI要素 (追加)
let myPeerIdElClient;
let copyIdButtonClient;

// SDP生成フラグ
let isSdpGenerated = false;

// グローバルにアクセス可能な変数と関数
window.isOnlineMode = () => isOnlineMode;
window.isHost = () => isHost;

// ログ表示関数をグローバルに公開
window.logMessage = (message, type) => {
    const p = document.createElement('p');
    p.textContent = message;
    if (type) {
        p.classList.add('log-message', type);
    }
    if (messageLogEl) {
        messageLogEl.appendChild(p);
        messageLogEl.scrollTop = messageLogEl.scrollHeight;
    }
};

// SDPの圧縮・伸長関数
function compressSDP(sdp) {
    const jsonSdp = JSON.stringify(sdp);
    const textEncoder = new TextEncoder();
    const compressed = pako.deflate(textEncoder.encode(jsonSdp));
    return btoa(String.fromCharCode.apply(null, compressed));
}

function decompressSDP(compressedSdp) {
    const binaryString = atob(compressedSdp);
    const uint8Array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
    }
    const decompressed = pako.inflate(uint8Array);
    const textDecoder = new TextDecoder();
    return JSON.parse(textDecoder.decode(decompressed));
}

// DOMが読み込まれた後に初期化
document.addEventListener('DOMContentLoaded', () => {
    onlinePartyGoButton = document.getElementById('online-party-go-button');
    myPeerIdEl = document.getElementById('my-peer-id');
    connectionStatusEl = document.getElementById('connection-status');
    peerIdInput = document.getElementById('peer-id-input');
    goButton = document.getElementById('go-button');
    hostUiEl = document.getElementById('host-ui');
    clientUiEl = document.getElementById('client-ui');
    showHostUiButton = document.getElementById('show-host-ui-button');
    showClientUiButton = document.getElementById('show-client-ui-button');
    startHostConnectionButton = document.getElementById('start-host-connection-button');
    connectButton = document.getElementById('connect-button');
    onlineScreen = document.getElementById('online-screen');
    messageLogEl = document.getElementById('message-log');
    copyIdButton = document.getElementById('copy-id-button');

    peerIdInputHost = document.getElementById('peer-id-input-host');
    connectButtonHost = document.getElementById('connect-button-host');

    // クライアント側のUI要素を取得 (追加)
    myPeerIdElClient = document.getElementById('my-peer-id-client');
    copyIdButtonClient = document.getElementById('copy-id-button-client');

    // イベントリスナー設定
    if (document.getElementById('online-button')) {
        document.getElementById('online-button').addEventListener('click', () => {
            cleanupConnection();
            isOnlineMode = true;
            document.getElementById('title-screen').classList.add('hidden');
            if (onlineScreen) onlineScreen.classList.remove('hidden');
        });
    }

    if (document.getElementById('back-to-title-button')) {
        document.getElementById('back-to-title-button').addEventListener('click', () => {
            cleanupConnection();
            isOnlineMode = false;
            if (onlineScreen) onlineScreen.classList.add('hidden');
            if (document.getElementById('title-screen')) document.getElementById('title-screen').classList.remove('hidden');
        });
    }


    if (showHostUiButton) {
        showHostUiButton.addEventListener('click', () => {
            isHost = true;
            if (hostUiEl) hostUiEl.classList.remove('hidden');
            if (clientUiEl) clientUiEl.classList.add('hidden');
            if (myPeerIdEl) myPeerIdEl.textContent = 'SDPを生成中...';
            window.logMessage('ホストモードに切り替えました。');
            startPeerConnection();
        });
    }

    if (showClientUiButton) {
        showClientUiButton.addEventListener('click', () => {
            isHost = false;
            if (hostUiEl) hostUiEl.classList.add('hidden');
            if (clientUiEl) clientUiEl.classList.remove('hidden');
            // クライアントモードに切り替えたときに myPeerIdElClient もクリア
            if (myPeerIdElClient) myPeerIdElClient.textContent = '';
            window.logMessage('クライアントモードに切り替えました。');
        });
    }

    // コピーボタンのイベントリスナー（ホスト側）
    if (copyIdButton) {
        copyIdButton.addEventListener('click', async () => {
            const sdpText = myPeerIdEl.textContent;
            if (sdpText && sdpText !== 'SDPを生成中...' && sdpText !== 'SDPをここに貼り付けてください。') {
                try {
                    await navigator.clipboard.writeText(sdpText);
                    const originalText = copyIdButton.textContent;
                    copyIdButton.textContent = 'コピーしました！';
                    setTimeout(() => {
                        copyIdButton.textContent = originalText;
                    }, 1500);
                    window.logMessage('SDPがクリップボードにコピーされました！', 'info');
                } catch (err) {
                    console.error('コピー失敗:', err);
                    window.logMessage('SDPのコピーに失敗しました。ブラウザの権限を確認してください。', 'error');
                }
            }
        });
    }

    // クライアント側のコピーボタンのイベントリスナー (追加)
    if (copyIdButtonClient) {
        copyIdButtonClient.addEventListener('click', async () => {
            const sdpText = myPeerIdElClient.textContent;
            if (sdpText && sdpText !== 'SDPを生成中...' && sdpText !== 'SDPをここに貼り付けてください。' && sdpText !== '') {
                try {
                    await navigator.clipboard.writeText(sdpText);
                    const originalText = copyIdButtonClient.textContent;
                    copyIdButtonClient.textContent = 'コピーしました！';
                    setTimeout(() => {
                        copyIdButtonClient.textContent = originalText;
                    }, 1500);
                    window.logMessage('SDPがクリップボードにコピーされました！', 'info');
                } catch (err) {
                    console.error('コピー失敗:', err);
                    window.logMessage('SDPのコピーに失敗しました。ブラウザの権限を確認してください。', 'error');
                }
            }
        });
    }

    // ホスト側の「接続を開始」ボタンのイベントリスナー
    if (startHostConnectionButton) {
        startHostConnectionButton.addEventListener('click', () => {
            startPeerConnection();
        });
    }

    // ホスト側の「接続完了」ボタンのイベントリスナー
    if (connectButtonHost) {
        connectButtonHost.addEventListener('click', async () => {
            const compressedSdpText = peerIdInputHost.value;
            if (!compressedSdpText) {
                window.logMessage('相手のSDPを貼り付けてください。', 'error');
                return;
            }

            if (!peerConnection) {
                window.logMessage('先に「接続を開始」ボタンを押してください。', 'error');
                return;
            }

            window.logMessage('相手のSDPを処理中...', 'info');
            try {
                const answerSdp = decompressSDP(compressedSdpText);
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answerSdp));
                window.logMessage('接続確立！', 'success');
                if (connectionStatusEl) connectionStatusEl.textContent = `接続状態: connected`;
            } catch (error) {
                console.error('Answer処理エラー:', error);
                window.logMessage('相手のSDPの処理中にエラーが発生しました。', 'error');
                cleanupConnection();
            }
        });
    }

    // クライアント側の「接続」ボタンのイベントリスナー
    if (connectButton) {
        connectButton.addEventListener('click', async () => {
            const compressedSdpText = peerIdInput.value;
            if (!compressedSdpText) {
                window.logMessage('SDP offerを貼り付けてください。', 'error');
                return;
            }

            if (peerConnection) {
                window.logMessage('SDPはすでに生成されています。', 'info');
                return;
            }

            window.logMessage('PeerConnectionのセットアップを開始します...', 'info');
            setupPeerConnection();

            try {
                const offerSdp = decompressSDP(compressedSdpText);
                await peerConnection.setRemoteDescription(new RTCSessionDescription(offerSdp));
                window.logMessage(`RemoteDescriptionを設定しました (offer)`, 'info');

                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);

                isSdpGenerated = false; // クライアント側でもフラグをリセット
                // SDPを生成して表示する
                const showSdp = () => {
                    if (!isSdpGenerated) {
                        const compressedAnswer = compressSDP(peerConnection.localDescription);
                        // クライアント側の myPeerIdElClient に表示するように変更
                        if (myPeerIdElClient) myPeerIdElClient.textContent = compressedAnswer;
                        window.logMessage('SDPを生成しました。ホストに伝えてください。', 'success');
                        isSdpGenerated = true;
                    }
                };

                peerConnection.onicegatheringstatechange = () => {
                    console.log('ICE Gathering State:', peerConnection.iceGatheringState);
                    if (peerConnection.iceGatheringState === 'complete') {
                        showSdp();
                    }
                };

                // 2秒後にSDPを強制的に表示する（タイムアウト）
                setTimeout(showSdp, 2000);
            } catch (error) {
                console.error('Answer作成エラー:', error);
                window.logMessage('Answer作成中にエラーが発生しました。', 'error');
            }
        });
    }

    // クライアント側でペーストしたら自動接続
    if (peerIdInput && connectButton) {
        peerIdInput.addEventListener('paste', () => {
            setTimeout(() => {
                connectButton.click();
            }, 100);
        });
    }

    // パーティー編成に進むボタンのイベントリスナー
    if (onlinePartyGoButton) {
        onlinePartyGoButton.addEventListener('click', () => {
            // キャラクターIDから実際のキャラクターオブジェクトを取得する
            const playerPartyData = ['char01', 'char02', 'char03'].map(id => characters[id]);
            const opponentPartyData = ['char04', 'char05', 'char06'].map(id => characters[id]);

            window.initializePlayerParty(playerPartyData);
            window.handleOpponentParty(opponentPartyData);
            if (onlineScreen) onlineScreen.classList.add('hidden');
            if (document.getElementById('party-screen')) document.getElementById('party-screen').classList.remove('hidden');
            if (goButton) goButton.disabled = false;
            window.logMessage('パーティー編成画面に移動しました。', 'success');
        });
    }
});

// PeerConnectionのセットアップ
function setupPeerConnection() {
    console.log("PeerConnectionのセットアップを開始します。");
    peerConnection = new RTCPeerConnection({
        iceServers: STUN_SERVERS
    });
    console.log("PeerConnectionが初期化されました。");

    // ICE候補が利用可能になったら、コンソールに表示
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('ICE候補を送信:', event.candidate);
        } else {
            console.log('ICE候補収集完了');
        }
    };

    // データチャネルの受信
    if (!isHost) {
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            handleChannelStatusChange();
            dataChannel.onmessage = handleDataChannelMessage;
        };
    } else {
        dataChannel = peerConnection.createDataChannel("game-data");
        handleChannelStatusChange();
    }
}

// SDP生成と表示のロジックを分離
async function startPeerConnection() {
    if (peerConnection) {
        window.logMessage('SDPはすでに生成されています。', 'info');
        return;
    }

    window.logMessage('PeerConnectionのセットアップを開始します...', 'info');
    setupPeerConnection();
    isSdpGenerated = false;

    // SDPを生成して表示する
    const showSdp = () => {
        if (!isSdpGenerated) {
            const compressedOffer = compressSDP(peerConnection.localDescription);
            if (myPeerIdEl) myPeerIdEl.textContent = compressedOffer;
            window.logMessage('SDPを生成しました。コピーボタンを押して相手に伝えてください。', 'success');
            isSdpGenerated = true;
        }
    };

    peerConnection.onicegatheringstatechange = () => {
        console.log('ICE Gathering State:', peerConnection.iceGatheringState);
        if (peerConnection.iceGatheringState === 'complete') {
            showSdp();
        }
    };

    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        // 2秒後にSDPを強制的に表示する（タイムアウト）
        setTimeout(showSdp, 2000);
    } catch (error) {
        console.error('Offer作成エラー:', error);
        window.logMessage('Offer作成中にエラーが発生しました。', 'error');
    }
}

// データチャネルの状態が変化したときの処理
function handleChannelStatusChange() {
    if (dataChannel) {
        dataChannel.onopen = () => {
            window.logMessage('データチャネルが開かれました。', 'success');
            if (onlinePartyGoButton) {
                onlinePartyGoButton.classList.remove('hidden');
            }
        };
        dataChannel.onclose = () => {
            window.logMessage('データチャネルが閉じられました。', 'error');
        };
        dataChannel.onerror = (error) => {
            console.error('データチャネルエラー:', error);
            window.logMessage('データチャネルでエラーが発生しました。', 'error');
        };
    }
}

// データチャネルでメッセージを受信したときの処理
function handleDataChannelMessage(event) {
    if (isOnlineMode && !isHost) {
        const message = JSON.parse(event.data);
        const { eventType, eventData } = message;

        if (eventType === 'sync_party') {
            window.handleOpponentParty(eventData);
        } else if (eventType === 'start_battle') {
            window.startBattleWithOpponentParty(eventData.enemies);
        } else if (eventType === 'execute_action') {
            window.executeAction(eventData);
        } else if (eventType === 'sync_game_state') {
            window.syncGameStateClientSide(eventData);
        } else if (eventType === 'log_message') {
            window.logMessage(eventData.message, 'from-host');
        }
    }
}

// 接続のクリーンアップ関数
function cleanupConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    isOnlineMode = false;

    if (onlinePartyGoButton) {
        onlinePartyGoButton.classList.add('hidden');
    }
    if (myPeerIdEl) {
        myPeerIdEl.textContent = '';
    }
    if (connectionStatusEl) {
        connectionStatusEl.textContent = '';
    }
    if (peerIdInput) {
        peerIdInput.value = '';
    }
    // 修正：ホストとクライアント両方の入力フィールドをリセット
    if (peerIdInputHost) {
        peerIdInputHost.value = '';
    }
    if (myPeerIdElClient) {
        myPeerIdElClient.textContent = '';
    }
}

// 送信関数
window.sendData = function (eventType, data) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
        window.logMessage('データチャネルが開かれていません。データを送信できません。', 'error');
        return;
    }
    dataChannel.send(JSON.stringify({ eventType, eventData: data }));
};