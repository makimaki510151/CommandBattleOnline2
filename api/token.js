// api/token.js

// SkyWay SDK v3のライブラリをインポート
import { SkyWayAuthToken, generateToken } from '@skyway-sdk/token';

// uuidV4を直接実装
function uuidV4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// nowInSecを直接実装
function nowInSec() {
    return Math.floor(Date.now() / 1000);
}

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
        console.log('token.js: Attempting to generate SkyWay token...');
        // トークンを生成
        const token = generateToken({
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
        }, SECRET);

        console.log('token.js: SkyWay token generated successfully.');
        // クライアントにトークンとアプリIDをJSON形式で返す
        res.status(200).json({ token: token, appId: APP_ID });

    } catch (error) {
        console.error("token.js: Token generation error:", error);
        res.status(500).json({ error: "Failed to generate token" });
    }
};

