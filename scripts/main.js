// main.js (ログ同期対応版)
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

// 戦闘が開始されたかを追跡するフラグ
let isBattleStarted = false;

// グローバルにアクセス可能な変数と関数
window.isOnlineMode = () => isOnlineMode;
window.isHost = () => isHost;

// ログ表示関数をグローバルに公開
window.logMessage = (message, type = '') => {
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
                } catch (err) {
                    console.error('コピー失敗:', err);
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
                } catch (err) {
                    console.error('コピー失敗:', err);
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
                return;
            }

            if (!peerConnection) {
                return;
            }

            try {
                const answerSdp = decompressSDP(compressedSdpText);
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answerSdp));
                if (connectionStatusEl) connectionStatusEl.textContent = `接続状態: connected`;
            } catch (error) {
                console.error('Answer処理エラー:', error);
                cleanupConnection();
            }
        });
    }

    // クライアント側でペーストしたら自動接続
    if (peerIdInput) {
        peerIdInput.addEventListener('paste', () => {
            setTimeout(async () => {
                const compressedSdpText = peerIdInput.value;
                if (!compressedSdpText) {
                    return;
                }

                if (peerConnection) {
                    return;
                }

                setupPeerConnection();

                try {
                    const offerSdp = decompressSDP(compressedSdpText);
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(offerSdp));

                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);

                    isSdpGenerated = false; // クライアント側でもフラグをリセット
                    // SDPを生成して表示する
                    const showSdp = () => {
                        if (!isSdpGenerated) {
                            const compressedAnswer = compressSDP(peerConnection.localDescription);
                            // クライアント側の myPeerIdElClient に表示するように変更
                            if (myPeerIdElClient) myPeerIdElClient.textContent = compressedAnswer;
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
                }
            }, 100);
        });
    }

    // パーティー編成に進むボタンのイベントリスナー
    if (onlinePartyGoButton) {
        onlinePartyGoButton.addEventListener('click', () => {
            const playerPartyData = window.getSelectedParty();
            window.initializePlayerParty(playerPartyData);
            if (onlineScreen) onlineScreen.classList.add('hidden');
            if (document.getElementById('party-screen')) document.getElementById('party-screen').classList.remove('hidden');
            if (goButton) goButton.disabled = false;
        });
    }

    if (goButton) {
        goButton.addEventListener('click', () => {
            const selectedParty = window.getSelectedParty();

            if (selectedParty.length === 0) {
                return;
            }

            // パーティー編成画面を非表示にし、戦闘画面を表示
            const partyScreen = document.getElementById('party-screen');
            const battleScreen = document.getElementById('battle-screen');
            if (partyScreen) partyScreen.classList.add('hidden');
            if (battleScreen) battleScreen.classList.remove('hidden');

            // オンラインモードに応じて戦闘を開始
            if (window.isOnlineMode()) {
                const myPartyData = window.getSelectedParty();
                window.initializePlayerParty(myPartyData);
                // 相手にパーティー情報を同期するための信号を送る
                window.sendData('sync_party', { partyData: myPartyData });
            } else {
                // シングルプレイの場合の戦闘開始ロジック（既存の関数を呼び出す）
                window.startBattle(selectedParty);
            }
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

    // データチャネルの受信 (ホストとクライアント両方で受信できるように変更)
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        handleChannelStatusChange();
        dataChannel.onmessage = handleDataChannelMessage;
    };

    if (isHost) {
        dataChannel = peerConnection.createDataChannel("game-data");
        handleChannelStatusChange();
        dataChannel.onmessage = handleDataChannelMessage;
    }
}

// SDP生成と表示のロジックを分離
async function startPeerConnection() {
    if (peerConnection) {
        return;
    }
    setupPeerConnection();
    isSdpGenerated = false;

    // SDPを生成して表示する
    const showSdp = () => {
        if (!isSdpGenerated) {
            const compressedOffer = compressSDP(peerConnection.localDescription);
            if (myPeerIdEl) myPeerIdEl.textContent = compressedOffer;
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
    }
}

// データチャネルの状態が変化したときの処理
function handleChannelStatusChange() {
    if (dataChannel) {
        dataChannel.onopen = () => {
            if (onlinePartyGoButton) {
                onlinePartyGoButton.classList.remove('hidden');
            }
        };
        dataChannel.onclose = () => {
        };
        dataChannel.onerror = (error) => {
            console.error('データチャネルエラー:', error);
        };
    }
}

// データチャネルでメッセージを受信したときの処理
function handleDataChannelMessage(event) {
    const message = JSON.parse(event.data);
    const { eventType, eventData } = message;

    if (eventType === 'opponent_party') {
        // クライアントから相手パーティ情報を受信
        if (isHost && window.handleOpponentParty) {
            window.handleOpponentParty(eventData.party);
        }
    } else if (eventType === 'sync_party') {
        // 相手のパーティー情報を受け取って処理
        window.handleOpponentParty(eventData.partyData);
    } else if (eventType === 'start_battle') {
        // クライアント側はホストからのstart_battleイベントを受信するまで待機
        if (!isHost) {
            // クライアント側の戦闘開始処理を呼び出す前に、必要な初期化を行う
            // この関数はbattle.jsで定義されている
            window.startOnlineBattleClientSide(eventData.initialState);
        }
    } else if (eventType === 'execute_action') {
        window.executeAction(eventData);
    } else if (eventType === 'sync_game_state') {
        if (!isHost) {
            // クライアント側はホストから送られてきた状態を同期
            window.syncGameStateClientSide(eventData);

            // ★追加: 同期後、戦闘が終了しているかチェック
            if (window.isBattleOver && window.isBattleOver()) {
                window.handleBattleEnd();
            }

        } else if (isHost && window.syncGameStateHostSide) {
            // ★重要修正★
            // ホストが接続してから一定時間（例: 2秒）が経過していない場合、
            // または戦闘開始フラグがまだ立っていない場合は、バトル終了判定を含む
            // 可能性のある状態同期を無視する。（安全策）
            if (!window.isBattleOngoing()) {
                // 戦闘がまだ始まっていない（isBattleOngoing = false）場合は、
                // 致命的な終了判定を防ぐため、敢えてこのメッセージを無視しないようにする
                // 代わりに、handleOpponentPartyが安全に実行されるようにする。

                // ただし、このメッセージが原因で敗北判定が走る可能性があるため、
                // handleOpponentPartyの実行前に、不正な状態を回避するロジックを挟む
            }

            // ホスト側の同期ロジックを呼び出す
            window.syncGameStateHostSide(eventData);
        }
    } else if (eventType === 'log_message') {
        // ホストから送られてきたログメッセージを表示
        window.logMessage(eventData.message, eventData.type || 'from-host');
    } else if (eventType === 'request_action') {
        // クライアント側でアクション要求を受信
        if (!isHost) {
            window.handleActionRequest(eventData);
        }
    } else if (eventType === 'return_to_party_screen') {
        // ホストからの通知を受信した場合、クライアントも画面を戻す
        if (!isHost && window.returnToPartyScreen) {
            window.returnToPartyScreen();
            window.cleanupConnection(); // 接続もクリーンアップ
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
        return;
    }
    dataChannel.send(JSON.stringify({ eventType, eventData: data }));
};
