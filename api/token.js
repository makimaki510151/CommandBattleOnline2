// SkyWay SDKの認証ライブラリをインポート
const { SkyWayAuthToken, uuidV4 } = require('@skyway-sdk/room/dist/skyway_room.cjs.js');

// Vercelの環境変数として設定する、あなたのアプリケーションIDと秘密鍵
const APP_ID = process.env.SKYWAY_APP_ID;
const SECRET_KEY = process.env.SKYWAY_SECRET_KEY;

// サーバーレス関数
module.exports = (req, res) => {
  // 環境変数が設定されていない場合はエラーを返す
  if (!APP_ID || !SECRET_KEY) {
    res.status(500).json({ error: 'SKYWAY_APP_ID or SKYWAY_SECRET_KEY is not set.' });
    return;
  }

  // トークンを生成
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
};