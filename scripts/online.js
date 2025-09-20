// online.js

import { getSelectedParty } from './party.js';
import { executeRemoteAction } from './battle.js';
import { SkyWayContext, SkyWayRoom } from '@skyway-sdk/room';

// ⚠️ 注意: 実際のアプリケーションでは、APIキーとシークレットをクライアントに
// 露出させるべきではありません。サーバーサイドで認証トークンを生成してください。
// ここではデモンストレーションのため、直接記述しています。
const API_KEY = 'd5450488-422b-47bf-93a0-baa8d2d3316c';
const API_SECRET = 'your-api-secret-from-skyway-console'; // あなたのAPIシークレット

const roomNameInput = document.getElementById('room-name-input');
const joinButton = document.getElementById('join-button');
const connectionStatusEl = document.getElementById('connection-status');
const myRoomInfoEl = document.getElementById('my-room-info');
const roomMembersEl = document.getElementById('room-members');

let room = null;
let myParty = null;
let opponentParty = null;
let opponentId = null; // 相手のメンバーID

// 認証トークンを生成する関数
// ⚠️ 実際の製品開発では、この処理をサーバーサイドで行う必要があります。
// クライアント側でシークレットを公開するのはセキュリティ上危険です。
function generateToken(apiKey, apiSecret) {
    const payload = {
        jti: 'unique-id-' + Math.random().toString(36).substr(2, 9),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // 1時間有効
        scope: {
            app: {
                id: apiKey,
                turn: true,
                actions: ['read', 'write'],
                channels: [
                    {
                        id: '*',
                        name: '*',
                        actions: ['write'],
                        members: [{ id: '*', actions: ['write'] }],
                        sfuBots: [{ actions: ['write'] }]
                    }
                ]
            }
        }
    };

    const header = {
        alg: 'HS256',
        typ: 'JWT'
    };

    const base64UrlEncode = (obj) => {
        return btoa(JSON.stringify(obj))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    };

    const encodedHeader = base64UrlEncode(header);
    const encodedPayload = base64UrlEncode(payload);

    // 簡易的な署名生成（実際にはcryptoライブラリを使用します）
    // ここでは、SDKのデモンストレーションのため、あくまで仮の処理です
    const signature = 'DUMMY_SIGNATURE_DO_NOT_USE_IN_PRODUCTION';

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// オンラインプレイの初期化
export async function initOnlinePlay() {
    connectionStatusEl.textContent = '初期化中...';

    // ルーム参加ボタンのイベントリスナー
    joinButton.addEventListener('click', () => {
        const roomName = roomNameInput.value;
        if (!roomName) {
            alert('ルーム名を入力してください。');
            return;
        }
        joinRoom(roomName);
    });
}

// ルームに参加する関数
async function joinRoom(roomName) {
    try {
        if (room && !room.isClosed) {
            await room.close();
        }

        const token = generateToken(API_KEY, API_SECRET);
        const context = await SkyWayContext.Create(token);

        room = await SkyWayRoom.FindOrCreate(context, {
            name: roomName,
            type: 'p2p' // メッシュルームを使用
        });

        connectionStatusEl.textContent = 'ルームに参加中...';

        await room.join();
        myRoomInfoEl.textContent = `ルームID: ${room.id}`;
        connectionStatusEl.textContent = 'ルームに参加しました！';

        // メンバーリストの更新
        updateMemberList();

        // メンバーが参加した時のイベント
        room.onMemberJoined.add(() => {
            updateMemberList();
            // 相手が参加したと判断
            if (room.members.length === 2) {
                const otherMember = room.members.find(m => m.id !== room.me.id);
                opponentId = otherMember.id;
                
                // ホスト側（最初にルームに入った側）が先にパーティーデータを送信
                if (room.members.indexOf(room.me) < room.members.indexOf(otherMember)) {
                    sendPartyData();
                }

                // パーティー編成画面に遷移
                setTimeout(() => {
                    document.getElementById('online-screen').classList.add('hidden');
                    document.getElementById('party-screen').classList.remove('hidden');
                }, 1500);
            }
        });

        // メンバーが退出した時のイベント
        room.onMemberLeft.add(() => {
            updateMemberList();
            if (room.members.length < 2) {
                alert('相手がルームから退出しました。');
                location.reload();
            }
        });

        // データを受信した時のイベント
        room.onData.add(e => {
            const data = JSON.parse(e.data);
            console.log('Received data:', data);

            if (data.type === 'party_data') {
                opponentParty = data.payload;
                checkAndStartBattle();
            } else if (data.type === 'battle_action') {
                executeRemoteAction(data.payload);
            }
        });
    } catch (e) {
        console.error('Failed to join room', e);
        connectionStatusEl.textContent = '接続に失敗しました。';
        alert(`接続エラー: ${e.message}`);
    }
}

// メンバーリストのUI更新
function updateMemberList() {
    if (room) {
        roomMembersEl.textContent = room.members.length;
    }
}

// パーティー編成後の処理
export function startOnlineBattle(party) {
    myParty = party;
    sendPartyData();
    checkAndStartBattle();
}

// 相手に自分のパーティーデータを送信
function sendPartyData() {
    if (room && opponentId) {
        room.sendData(JSON.stringify({ type: 'party_data', payload: myParty }), [opponentId]);
    }
}

// 双方のパーティーデータが揃ったか確認し、戦闘を開始
function checkAndStartBattle() {
    if (myParty && opponentParty) {
        window.startBattleScreen(myParty, opponentParty);
    }
}

// battle.jsから呼び出される、相手にアクションを送信する関数
export function sendBattleAction(action) {
    if (room && opponentId) {
        room.sendData(JSON.stringify({ type: 'battle_action', payload: action }), [opponentId]);
    } else {
        console.error('Room or opponent not available.');
    }
}