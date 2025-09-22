// api/token.js

// CommonJS版のライブラリをインポート
const { SkyWayAuthToken, uuidV4 } = require('@skyway-sdk/room/dist/skyway_room.cjs.js');

const APP_ID = process.env.SKYWAY_APP_ID;
const SECRET_KEY = process.env.SKYWAY_SECRET_KEY;

// サーバーレス関数
module.exports = (req, res) => {
    // CORSヘッダーを追加
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // OPTIONSリクエスト（プリフライトリクエスト）に対応
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 環境変数が設定されていない場合はエラーを返す
    if (!APP_ID || !SECRET_KEY) {
        console.error('Environment variables SKYWAY_APP_ID or SKYWAY_SECRET_KEY are not set.');
        res.status(500).json({ error: 'Server configuration error.' });
        return;
    }

    try {
        const token = new SkyWayAuthToken({
            jti: uuidV4(),
            iat: Date.now(),
            exp: Date.now() + 60 * 60 * 1000, // 1時間有効
            scope: {
                app: {
                    id: APP_ID,
                    turn: true,
                    actions: ['read', 'write'],
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
                                },
                            ],
                            sfuBots: [
                                {
                                    actions: ['write'],
                                },
                            ],
                        },
                    ],
                },
            },
        }).encode(SECRET_KEY);

        // トークンをJSON形式で返す
        res.status(200).json({ token });
    } catch (error) {
        console.error('Failed to generate token:', error);
        res.status(500).json({ error: 'Failed to generate token.' });
    }
};