// api/token.js

// SkyWay SDK v3のライブラリをインポート
import { SkyWayAuthToken } from '@skyway-sdk/token';

// Vercelに設定した環境変数を読み込む
export default async (req, res) => {
    console.log('token.js: Function started.');

    // 環境変数を関数内で読み込む
    const APP_ID = process.env.SKYWAY_APP_ID;
    const SECRET = process.env.SKYWAY_SECRET_KEY;

    console.log('token.js: APP_ID (first 5 chars):', APP_ID ? APP_ID.substring(0, 5) : 'not found');
    console.log('token.js: SECRET (first 5 chars):', SECRET ? SECRET.substring(0, 5) : 'not found');

    // 環境変数が設定されているか確認
    if (!APP_ID || !SECRET) {
        console.error("token.js: Environment variables for SkyWay are not set.");
        res.status(500).json({ error: "Server configuration error: missing credentials." });
        return;
    }

    try {
        console.log('token.js: Attempting to dynamically import @skyway-sdk/common...');
        // @skyway-sdk/common を動的にインポート
        const common = await import('@skyway-sdk/common');
        const { uuidV4, nowInSec } = common;

        console.log('token.js: Dynamically imported @skyway-sdk/common successfully.');
        console.log('token.js: Attempting to create SkyWayAuthToken...');
        // トークンを生成
        const token = new SkyWayAuthToken({
            jti: uuidV4(),
            iat: nowInSec(),
            exp: nowInSec() + 60 * 60 * 2, // 2時間
            scope: {
                appId: APP_ID,
                turn: true,
                rooms: [
                    {
                        name: "*",
                        methods: ["read", "write"],
                        members: [
                            {
                                name: "*",
                                methods: ["read", "write"],
                            },
                        ],
                    },
                ],
            },
        }).encode(SECRET);

        console.log('token.js: SkyWayAuthToken created successfully.');
        // クライアントにトークンとアプリIDをJSON形式で返す
        res.status(200).json({ token: token, appId: APP_ID });

    } catch (error) {
        console.error("token.js: Token generation error:", error);
        res.status(500).json({ error: "Failed to generate token" });
    }
};

