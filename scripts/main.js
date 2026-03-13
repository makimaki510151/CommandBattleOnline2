// main.js

// SkyWay SDKのクラスをグローバルから取得
let SkyWayContext, SkyWayRoom;

let room = null;
let me = null;
let dataStream = null;

let isOnlineMode = false;
let isHost = false;

// DOM要素の宣言
let onlinePartyGoButton, connectionStatusEl, onlineScreen, messageLogEl;
let goButton, roomNameInput, joinRoomButton, backToTitleButton;

// ログ表示関数（skillInfo = { name, desc, flavor } でスキル名にホバー説明を付与）
function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

window.logMessage = (message, type = '', skillInfo = null) => {
    const p = document.createElement('p');
    if (type) p.classList.add('log-message', type);

    if (skillInfo && skillInfo.name) {
        const safeMsg = escapeHtml(message);
        const safeName = escapeHtml(skillInfo.name);
        const span = `<span class="log-skill-name" data-desc="${escapeHtml(skillInfo.desc || '')}" data-flavor="${escapeHtml(skillInfo.flavor || '')}">${safeName}</span>`;
        p.innerHTML = safeMsg.includes(safeName) ? safeMsg.replace(safeName, span) : safeMsg;
    } else {
        p.textContent = message;
    }

    if (messageLogEl) {
        messageLogEl.appendChild(p);
        messageLogEl.scrollTop = messageLogEl.scrollHeight;
    }
};

// ログ内スキル名のツールチップ用（DOMContentLoaded後に設定）
function setupLogSkillTooltips() {
    const logEl = document.getElementById('message-log');
    if (!logEl) return;
    let tooltipEl = null;
    logEl.addEventListener('mouseover', (e) => {
        const el = e.target.closest('.log-skill-name');
        if (!el) return;
        if (tooltipEl) return;
        const desc = el.dataset.desc;
        const flavor = el.dataset.flavor;
        if (!desc && !flavor) return;
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'log-skill-tooltip';
        tooltipEl.innerHTML = desc ? `<div>${escapeHtml(desc)}</div>` : '';
        if (flavor) tooltipEl.innerHTML += `<div class="log-skill-flavor">${escapeHtml(flavor)}</div>`;
        document.body.appendChild(tooltipEl);
        const rect = el.getBoundingClientRect();
        tooltipEl.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`;
        tooltipEl.style.top = `${rect.bottom + 4}px`;
    });
    logEl.addEventListener('mouseout', (e) => {
        if (!e.relatedTarget?.closest?.('.log-skill-name')) {
            if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
        }
    });
}

// モバイル判定
function isMobileDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android|webOS|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
}

// トークン取得
async function getSkyWayToken() {
    try {
        const res = await fetch('/api/token');

        if (!res.ok) {
            const errorDetail = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorDetail.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.token) {
            throw new Error('レスポンスにトークンが含まれていません');
        }

        return data;
    } catch (err) {
        console.error('Token fetch error:', err);
        throw new Error(`認証エラー: ${err.message}`);
    }
}

// SkyWay接続メイン処理
async function connectToSkyWay(roomName) {
    try {
        const sw = window.skyway_room;
        if (!sw) throw new Error("SkyWay SDKが読み込まれていません。");

        SkyWayContext = sw.SkyWayContext;
        SkyWayRoom = sw.SkyWayRoom;

        if (connectionStatusEl) connectionStatusEl.textContent = '接続中...';

        const { token } = await getSkyWayToken();
        const context = await SkyWayContext.Create(token);

        room = await SkyWayRoom.FindOrCreate(context, {
            type: 'p2p',
            name: roomName,
        });

        me = await room.join();

        // 1人目ならホスト、2人目以降ならクライアント
        isHost = room.members.length === 1;

        const streamFactory = sw.SkyWayStreamFactory ?? sw.StreamFactory;
        dataStream = await streamFactory.createDataStream();
        await me.publish(dataStream);

        if (connectionStatusEl) {
            connectionStatusEl.textContent = `ルーム「${roomName}」に接続完了 (${isHost ? 'ホスト' : 'クライアント'})`;
        }

        setupSkyWayEventListeners();

        // クライアント側（2人目）なら、参加した瞬間に画面遷移
        if (!isHost) {
            transitionToPartyScreen();
        } else {
            // ホスト側は相手を待つ状態なので、案内を表示
            window.logMessage("対戦相手の参加を待っています...", "status-effect");
        }

    } catch (err) {
        console.error('SkyWay接続エラー:', err);
        if (connectionStatusEl) connectionStatusEl.textContent = 'エラー: ' + err.message;
    }
}

// 受信イベント設定
function setupSkyWayEventListeners() {
    room.onMemberJoined.add((e) => {
        window.logMessage(`対戦相手が参加しました`, 'status-effect');

        // ホスト側：クライアントが来たら自動でパーティー編成へ
        if (isHost) {
            transitionToPartyScreen();
        }
    });

    // 相手がpublishしたDataStreamを購読しないと受信できない
    // (publishは自動購読されない)
    const trySubscribeDataPublication = async (publication) => {
        try {
            if (!publication) return;
            if (publication.publisher?.id === me?.id) return; // 自分のpublicationは不要
            if (publication.contentType !== 'data') return;
            await me.subscribe(publication.id);
        } catch (err) {
            console.warn('Failed to subscribe data publication:', err);
        }
    };

    // 既に存在するpublicationがあれば購読（入室順によっては必要）
    try {
        if (Array.isArray(room.publications)) {
            room.publications.forEach((p) => { void trySubscribeDataPublication(p); });
        }
    } catch (e) {
        // ignore
    }

    // 新しくpublishされたら都度購読
    if (room.onStreamPublished?.add) {
        room.onStreamPublished.add((e) => {
            void trySubscribeDataPublication(e?.publication);
        });
    } else if (room.onPublicationPublished?.add) {
        room.onPublicationPublished.add((e) => {
            void trySubscribeDataPublication(e?.publication);
        });
    }

    me.onPublicationSubscribed.add(({ stream }) => {
        if (stream.contentType === 'data') {
            stream.onData.add((data) => {
                if (window.handleDataChannelMessage) {
                    window.handleDataChannelMessage(data);
                }
            });
        }
    });
}

function transitionToPartyScreen() {
    if (onlineScreen) onlineScreen.classList.add('hidden');
    document.getElementById('party-screen')?.classList.remove('hidden');
    if (goButton) goButton.disabled = false;

    // オンライン用のセットアップUIを非表示にする（任意）
    document.getElementById('online-setup')?.classList.add('hidden');
}

// データ送信関数
window.sendData = function (eventType, data) {
    if (dataStream) {
        dataStream.write({ eventType, eventData: data });
    }
};

// データ受信（battle.jsへルーティング）
window.handleDataChannelMessage = function (payload) {
    if (!payload || typeof payload !== 'object') return;
    const { eventType, eventData } = payload;

    try {
        switch (eventType) {
            case 'sync_party': {
                const partyData = eventData?.partyData;
                if (partyData && window.handleOpponentParty) {
                    window.handleOpponentParty(partyData);
                }
                break;
            }
            case 'start_battle': {
                // クライアント：ホストから開始通知を受けて戦闘画面へ
                document.getElementById('party-screen')?.classList.add('hidden');
                document.getElementById('battle-screen')?.classList.remove('hidden');
                if (window.startOnlineBattleClientSide) {
                    window.startOnlineBattleClientSide(eventData?.initialState);
                }
                break;
            }
            case 'request_action': {
                if (window.handleActionRequest) window.handleActionRequest(eventData);
                break;
            }
            case 'execute_action': {
                if (window.executeAction) window.executeAction(eventData);
                break;
            }
            case 'sync_game_state': {
                if (window.syncGameStateClientSide) window.syncGameStateClientSide(eventData);
                break;
            }
            case 'log_message': {
                if (eventData?.message && window.logMessage) {
                    window.logMessage(eventData.message, eventData.type || '', eventData.skillInfo || null);
                }
                break;
            }
            case 'return_to_party_screen': {
                if (window.returnToPartyScreen) window.returnToPartyScreen();
                break;
            }
            default:
                // unknown eventType: ignore
                break;
        }
    } catch (e) {
        console.error('DataChannel message handling error:', e, payload);
    }
};

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    onlinePartyGoButton = document.getElementById('online-party-go-button');
    connectionStatusEl = document.getElementById('connection-status');
    onlineScreen = document.getElementById('online-screen');
    messageLogEl = document.getElementById('message-log');
    setupLogSkillTooltips();
    goButton = document.getElementById('go-button');
    roomNameInput = document.getElementById('room-name-input');
    joinRoomButton = document.getElementById('join-room-button');
    backToTitleButton = document.getElementById('back-to-title-button');

    // ルーム接続ボタンのクリックハンドラ
    joinRoomButton?.addEventListener('click', () => {
        const roomName = roomNameInput?.value;
        if (!roomName) {
            alert("ルームIDを入力してください");
            return;
        }
        connectToSkyWay(roomName);
    });

    // タイトル画面の「オンライン対戦」ボタン
    document.getElementById('online-button')?.addEventListener('click', () => {
        isOnlineMode = true;
        document.getElementById('title-screen')?.classList.add('hidden');
        onlineScreen?.classList.remove('hidden');
    });

    // タイトルに戻るボタン
    backToTitleButton?.addEventListener('click', () => {
        cleanupConnection();
        onlineScreen?.classList.add('hidden');
        document.getElementById('title-screen')?.classList.remove('hidden');
    });

    // 「バトル開始！（パーティー編成へ）」ボタン
    onlinePartyGoButton?.addEventListener('click', () => {
        if (onlineScreen) onlineScreen.classList.add('hidden');
        document.getElementById('party-screen')?.classList.remove('hidden');
        if (goButton) goButton.disabled = false;
    });

    // パーティー画面の「出かける（GO）」ボタン
    goButton?.addEventListener('click', () => {
        if (!window.getSelectedParty) return;
        const selectedParty = window.getSelectedParty();
        if (selectedParty.length === 0) {
            alert("パーティーを選択してください");
            return;
        }

        document.getElementById('party-screen')?.classList.add('hidden');
        document.getElementById('battle-screen')?.classList.remove('hidden');

        if (isOnlineMode) {
            // battle.js側の「自分のパーティ準備完了」フラグを立てる
            if (window.initializePlayerParty) {
                window.initializePlayerParty(selectedParty);
            }
            window.sendData('sync_party', { partyData: selectedParty });
            window.logMessage?.('対戦相手の準備を待っています...', 'status-effect');
            if (goButton) goButton.disabled = true;
        } else {
            if (window.startBattle) window.startBattle(selectedParty);
        }
    });

    // モバイル警告
    const closeWarningButton = document.getElementById('close-warning-button');
    if (closeWarningButton) {
        closeWarningButton.addEventListener('click', () => {
            document.getElementById('mobile-warning-overlay')?.classList.add('hidden');
        });
    }
    if (isMobileDevice()) {
        document.getElementById('mobile-warning-overlay')?.classList.remove('hidden');
    }
});

// クリーンアップ
function cleanupConnection() {
    if (room) {
        room.leave();
        room = null;
    }
    isOnlineMode = false;
    if (onlinePartyGoButton) onlinePartyGoButton.classList.add('hidden');
    document.getElementById('online-setup')?.classList.add('hidden');
    if (connectionStatusEl) connectionStatusEl.textContent = '';
}

// グローバル公開用
window.isOnlineMode = () => isOnlineMode;
window.isHost = () => isHost;
window.cleanupConnection = cleanupConnection;