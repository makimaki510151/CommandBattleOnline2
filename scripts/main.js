// main.js (SkyWay対応版)

// SkyWay SDKはグローバル変数として読み込まれる
const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = window.skyway_room;

let context = null;
let room = null;
let localMember = null;
let dataStream = null;
let isHost = false;
let isOnlineMode = false;
let remoteMember = null;

// アプリケーションID
const APP_ID = 'd5450488-422b-47bf-93a0-baa8d2d3316c';

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
        const targetRoomName = peerIdInput.value.trim();
        if (!targetRoomName) {
            alert('ルーム名を入力してください。');
            return;
        }
        joinRoom(targetRoomName);
    });

    // 「IDをコピー」ボタン
    copyIdButton.addEventListener('click', () => {
        navigator.clipboard.writeText(myPeerIdEl.textContent).then(() => {
            alert('ルーム名をクリップボードにコピーしました！');
        });
    });

    // SkyWayの初期化
    async function initializeSkyWay() {
        connectionStatusEl.textContent = 'SkyWayを初期化中...';
        try {
            // 簡易的なJWTトークンを生成（実際のプロダクションでは適切なトークン生成が必要）
            const token = generateSimpleToken();
            
            context = await SkyWayContext.Create(token);
            
            // ランダムなルーム名を生成
            const roomName = generateRoomName();
            myPeerIdEl.textContent = roomName;
            
            connectionStatusEl.textContent = '接続待機中...';
            connectButton.disabled = false;
            copyIdButton.disabled = false;
            
            // ルームを作成してホストとして待機
            await createRoom(roomName);
            
        } catch (error) {
            console.error('SkyWay initialization failed:', error);
            connectionStatusEl.textContent = 'エラーが発生しました: ' + error.message;
        }
    }

    // 簡易的なJWTトークン生成（実際のプロダクションでは適切なトークン生成が必要）
    function generateSimpleToken() {
        const header = {
            alg: 'HS256',
            typ: 'JWT'
        };
        
        const payload = {
            jti: generateUniqueId(),
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600, // 1時間後に期限切れ
            scope: {
                app: {
                    id: APP_ID,
                    turn: true,
                    actions: ['read'],
                    channels: [
                        {
                            id: '*',
                            name: '*',
                            actions: ['write'],
                            members: [
                                {
                                    id: '*',
                                    name: '*',
                                    actions: ['write'],
                                    publication: {
                                        actions: ['write']
                                    },
                                    subscription: {
                                        actions: ['write']
                                    }
                                }
                            ],
                            sfuBots: [
                                {
                                    actions: ['write'],
                                    forwardings: [
                                        {
                                            actions: ['write']
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            }
        };
        
        // 注意: 実際のプロダクションでは、サーバーサイドで適切な秘密鍵を使用してJWTを生成する必要があります
        // ここでは簡易的な実装のため、クライアントサイドで生成していますが、セキュリティ上推奨されません
        const encodedHeader = btoa(JSON.stringify(header));
        const encodedPayload = btoa(JSON.stringify(payload));
        const signature = 'dummy_signature'; // 実際には適切な署名が必要
        
        return `${encodedHeader}.${encodedPayload}.${signature}`;
    }

    // ルーム名生成
    function generateRoomName() {
        return 'battle-room-' + Math.random().toString(36).substr(2, 9);
    }

    // ユニークID生成
    function generateUniqueId() {
        return 'user-' + Math.random().toString(36).substr(2, 9);
    }

    // ルーム作成（ホスト）
    async function createRoom(roomName) {
        try {
            room = await SkyWayRoom.FindOrCreate(context, {
                type: 'p2p',
                name: roomName
            });

            localMember = await room.join();
            isHost = true;

            // データストリームを作成
            dataStream = await SkyWayStreamFactory.createDataStream();
            await localMember.publish(dataStream);

            // メンバー参加イベントを監視
            room.onMemberJoined.add(handleMemberJoined);
            room.onMemberLeft.add(handleMemberLeft);

            connectionStatusEl.textContent = 'ルーム作成完了！相手の参加を待機中...';

        } catch (error) {
            console.error('Room creation failed:', error);
            connectionStatusEl.textContent = 'ルーム作成に失敗しました: ' + error.message;
        }
    }

    // ルーム参加（クライアント）
    async function joinRoom(roomName) {
        try {
            connectionStatusEl.textContent = 'ルームに参加中...';

            room = await SkyWayRoom.Find(context, {
                name: roomName
            });

            if (!room) {
                throw new Error('指定されたルームが見つかりません');
            }

            localMember = await room.join();
            isHost = false;

            // データストリームを作成
            dataStream = await SkyWayStreamFactory.createDataStream();
            await localMember.publish(dataStream);

            // 既存のメンバーのストリームを購読
            const members = room.members;
            for (const member of members) {
                if (member.id !== localMember.id) {
                    await subscribeToMember(member);
                }
            }

            // メンバー参加・退出イベントを監視
            room.onMemberJoined.add(handleMemberJoined);
            room.onMemberLeft.add(handleMemberLeft);

            connectionStatusEl.textContent = 'ルーム参加完了！';
            isOnlineMode = true;

            showProceedButton();

        } catch (error) {
            console.error('Room join failed:', error);
            connectionStatusEl.textContent = 'ルーム参加に失敗しました: ' + error.message;
        }
    }

    // メンバー参加時の処理
    async function handleMemberJoined(event) {
        const { member } = event;
        console.log('Member joined:', member.id);

        if (member.id !== localMember.id) {
            await subscribeToMember(member);
            
            if (isHost) {
                connectionStatusEl.textContent = '相手が参加しました！';
                isOnlineMode = true;
                showProceedButton();
            }
        }
    }

    // メンバー退出時の処理
    function handleMemberLeft(event) {
        const { member } = event;
        console.log('Member left:', member.id);
        
        if (member.id === remoteMember?.id) {
            remoteMember = null;
            connectionStatusEl.textContent = '相手が退出しました。';
            isOnlineMode = false;
        }
    }

    // メンバーのストリームを購読
    async function subscribeToMember(member) {
        try {
            const publications = member.publications;
            
            for (const publication of publications) {
                if (publication.contentType === 'data') {
                    const { stream } = await localMember.subscribe(publication.id);
                    
                    // データ受信イベントを設定
                    stream.onData.add((data) => {
                        handleReceivedData(data);
                    });
                    
                    remoteMember = member;
                    break;
                }
            }
        } catch (error) {
            console.error('Failed to subscribe to member:', error);
        }
    }

    // パーティー編成画面への進行ボタンを表示
    function showProceedButton() {
        const existingButton = document.querySelector('.online-controls .proceed-button');
        if (existingButton) return;

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

        document.querySelector('.online-controls').appendChild(proceedButton);
    }

    // SkyWayのクリーンアップ
    async function cleanupSkyWay() {
        try {
            if (localMember) {
                await localMember.leave();
                localMember = null;
            }
            if (room) {
                await room.dispose();
                room = null;
            }
            if (context) {
                await context.dispose();
                context = null;
            }
            dataStream = null;
            remoteMember = null;
        } catch (error) {
            console.error('Cleanup failed:', error);
        }
    }

    // 受信データの処理
    function handleReceivedData(data) {
        console.log('Received data:', data);

        // CustomEventを発行してbattle.jsで処理できるようにする
        const event = new CustomEvent('data_received', { detail: data });
        window.dispatchEvent(event);

        switch (data.type) {
            case 'party_data':
                if (window.handleOpponentParty) {
                    window.handleOpponentParty(data.party);
                }
                break;
                
            case 'start_battle':
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
        if (dataStream && remoteMember) {
            try {
                // functionタイプのプロパティを除外してシリアライズ
                const serializedData = JSON.parse(JSON.stringify(data, (key, value) => {
                    if (typeof value === 'function') {
                        return undefined;
                    }
                    return value;
                }));
                
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

    // SkyWayオブジェクトをグローバルに公開（デバッグ用）
    window.skyway = {
        context,
        room,
        localMember,
        dataStream,
        remoteMember
    };
});
