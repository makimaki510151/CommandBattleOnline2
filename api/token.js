// api/token.js

// SkyWay SDK v3のライブラリをインポート
const { SkyWayAuthToken } = require('@skyway-sdk/token');
const { uuidV4, nowInSec } = require('@skyway-sdk/common');

// Vercelに設定した環境変数を読み込む
const APP_ID = process.env.VITE_SKYWAY_APP_ID;
const SECRET = process.env.VITE_SKYWAY_SECRET_KEY;

// ログ出力（開発用）
console.log('APP_ID:', APP_ID);
console.log('Read SECRET key (first 10 chars):', SECRET ? SECRET.substring(0, 10) : 'not found');

module.exports = (req, res) => {
    // 環境変数が設定されているか確認
    if (!APP_ID || !SECRET) {
        console.error("Environment variables for SkyWay are not set.");
        res.status(500).json({ error: "Server configuration error: missing credentials." });
        return;
    }

    try {
        // トークンを生成
        const token = new SkyWayAuthToken({
            jti: uuidV4(),
            iat: nowInSec(),
            exp: nowInSec() + 60 * 60 * 2, // 2時間
            scope: {
                // `appId`はscopeのトップレベルに移動
                appId: APP_ID,
                // `turn`の権限もscopeのトップレベルで定義
                turn: true,
                // `rooms`はV3で新しく導入された概念
                rooms: [
                    {
                        name: "*", // ルーム名をワイルドカードで指定
                        methods: ["read", "write"], // V3では`actions`から`methods`に変更
                        members: [
                            {
                                name: "*", // メンバー名をワイルドカードで指定
                                methods: ["read", "write"],
                            },
                        ],
                    },
                ],
            },
        }).encode(SECRET);

        // クライアントにトークンとアプリIDをJSON形式で返す
        res.status(200).json({ token: token, appId: APP_ID });
    } catch (error) {
        console.error("Failed to generate or encode SkyWay token:", error);
        res.status(500).json({ error: "Server error: Failed to generate token." });
    }
};