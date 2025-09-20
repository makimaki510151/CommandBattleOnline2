// battle.js

import { enemyData, enemyGroups } from './enemies.js';

const enemyPartyEl = document.getElementById('enemy-party');
const playerPartyEl = document.getElementById('player-party');
const messageLogEl = document.getElementById('message-log');
const commandAreaEl = document.getElementById('command-area');
const battleScreenEl = document.getElementById('battle-screen');

let currentPlayerParty;
let currentEnemies;
let activePlayerIndex = 0;
let currentTurn = 0;
let isMyTurn = false;

// グローバルで利用可能なデータ接続オブジェクト
let dataConnection = null;

// ダメージ計算関数
function calculateDamage(attacker, defender) {
    // 物理攻撃
    const damage = Math.max(0, attacker.status.atk - defender.status.def);
    const isCritical = Math.random() < attacker.status.criticalRate;
    const finalDamage = isCritical ? damage * attacker.status.criticalMultiplier : damage;

    logMessage(`${attacker.name}の攻撃！ ${defender.name}に${finalDamage.toFixed(0)}のダメージ！`, 'damage');
    
    return finalDamage;
}

// ターン制御関数
function takeTurn() {
    if (isMyTurn) {
        // 自分のターン
        logMessage('あなたのターンです！', 'info');
        selectCommand(activePlayerIndex);
    } else {
        // 相手のターン
        logMessage('相手のターンです。待機中...', 'info');
        commandAreaEl.classList.add('hidden');
    }
}

// コマンド選択関数
function selectCommand(playerIndex) {
    const players = document.querySelectorAll('.player-character');
    players.forEach(p => p.classList.remove('active'));
    players[playerIndex].classList.add('active');
    commandAreaEl.classList.remove('hidden');

    // 攻撃ボタンのクリックイベントを設定
    commandAreaEl.innerHTML = `<button class="action-button" id="attack-button">攻撃</button>`;
    document.getElementById('attack-button').onclick = () => {
        // 攻撃対象を選択
        logMessage('攻撃する敵を選択してください。', 'info');
        const enemies = document.querySelectorAll('.enemy-character');
        enemies.forEach((enemy, index) => {
            enemy.onclick = () => {
                const action = {
                    type: 'attack',
                    playerIndex: playerIndex,
                    targetIndex: index
                };
                // 行動データを相手に送信
                dataConnection.send(action);
                // 自分のターンを終了
                isMyTurn = false;
                processAction(action);
            };
        });
    };
}

// 行動を処理する関数
function processAction(action) {
    if (action.type === 'attack') {
        const attacker = currentPlayerParty[action.playerIndex];
        const target = currentEnemies[action.targetIndex];
        
        if (!attacker || !target) return; // 無効な行動の場合は終了

        const damage = calculateDamage(attacker, target);
        target.status.hp = Math.max(0, target.status.hp - damage);
        
        logMessage(`${attacker.name}が${target.name}を攻撃！`, 'attack');

        renderBattle();
        checkBattleStatus();

        // 自分のターンが終了したら、次のプレイヤーへ
        activePlayerIndex++;
        if (activePlayerIndex >= currentPlayerParty.length) {
            // 自分のパーティー全員の行動が終わったら、相手のターンに切り替わる
            activePlayerIndex = 0;
            isMyTurn = false;
            // 相手にターン終了を通知
            dataConnection.send({ type: 'end-turn' });
        } else {
            // 次のプレイヤーにコマンド選択を促す
            takeTurn();
        }
    }
}

// バトル画面の描画
function renderBattle() {
    // プレイヤーの描画
    playerPartyEl.innerHTML = currentPlayerParty.map((char, index) => `
        <div class="player-character" data-index="${index}">
            <img src="${char.image}" alt="${char.name}">
            <p>${char.name}</p>
            <div class="hp-bar"><div class="hp-fill" style="width: ${(char.status.hp / char.status.maxHp) * 100}%;"></div></div>
        </div>
    `).join('');

    // 敵の描画
    enemyPartyEl.innerHTML = currentEnemies.map((enemy, index) => `
        <div class="enemy-character" data-index="${index}">
            <img src="${enemy.image}" alt="${enemy.name}">
            <p>${enemy.name}</p>
            <div class="hp-bar"><div class="hp-fill" style="width: ${(enemy.status.hp / enemy.status.maxHp) * 100}%;"></div></div>
        </div>
    `).join('');
}

// ログメッセージの表示
function logMessage(message, type = '') {
    const p = document.createElement('p');
    p.textContent = message;
    if (type) {
        p.classList.add(`log-message`, type);
    }
    messageLogEl.appendChild(p);
    messageLogEl.scrollTop = messageLogEl.scrollHeight;
}

// 勝敗判定
function checkBattleStatus() {
    // 敵が全滅したか
    if (currentEnemies.every(enemy => enemy.status.hp <= 0)) {
        logMessage('あなたの勝利です！', 'win');
        alert('勝利！');
        commandAreaEl.classList.add('hidden');
        // 戦闘終了後の処理
    }
    // 味方が全滅したか
    if (currentPlayerParty.every(char => char.status.hp <= 0)) {
        logMessage('あなたの敗北です...', 'lose');
        alert('敗北...');
        commandAreaEl.classList.add('hidden');
        // 戦闘終了後の処理
    }
}

// バトル開始
export function startBattle(party) {
    currentPlayerParty = party;
    // 敵はランダムに選択
    currentEnemies = [enemyData[Math.floor(Math.random() * enemyData.length)]];
    
    renderBattle();
    logMessage('戦闘開始！');
    
    // 対戦相手からパーティー情報を受け取る
    dataConnection.on('data', data => {
        if (data.type === 'party-info') {
            // 相手のパーティーを自分の敵として設定
            currentEnemies = data.party;
            renderBattle();
            logMessage('相手のパーティー情報を受信しました。');
            
            // ターン制御開始
            // どちらが先行か決めるロジック（ここでは簡略化のため、Peer IDの辞書順）
            if (window.peer.id < dataConnection.remoteId) {
                isMyTurn = true;
                logMessage('先行です。');
            } else {
                isMyTurn = false;
                logMessage('後攻です。');
            }
            takeTurn();
        } else if (data.type === 'action') {
            // 相手の行動を受信し処理
            logMessage('相手の行動を受信しました。');
            processAction(data);
        } else if (data.type === 'end-turn') {
            // 相手のターン終了を受信
            logMessage('相手のターンが終了しました。');
            isMyTurn = true;
            activePlayerIndex = 0; // 自分のターンの最初に戻す
            takeTurn();
        }
    });

    // 自分のパーティー情報を相手に送信
    dataConnection.send({
        type: 'party-info',
        party: currentPlayerParty
    });
}