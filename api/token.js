// api/token.js

// CommonJS版のライブラリをインポート
const { SkyWayAuthToken, uuidV4 } = require('@skyway-sdk/token');

// Vercelに設定した環境変数を読み込む
const APP_ID = process.env.VITE_SKYWAY_APP_ID;
const SECRET = process.env.VITE_SKYWAY_SECRET_KEY;

module.exports = (req, res) => {
  // 環境変数が設定されているか確認
  if (!APP_ID || !SECRET) {
    console.error("Environment variables for SkyWay are not set.");
    // 環境変数が未設定の場合は500エラーを返す
    res.status(500).json({ error: "Server configuration error: missing credentials." });
    return;
  }

  // トークンを生成
  const token = new SkyWayAuthToken({
    jti: uuidV4(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 2, // 2 hours
    scope: {
      app: {
        id: APP_ID,
        turn: true,
        actions: ["read"],
        channels: [
          {
            id: "*",
            name: "*",
            actions: ["write"],
            members: [
              {
                id: "*",
                name: "*",
                actions: ["write"],
              },
            ],
            sfuBots: [
              {
                actions: ["write"],
              },
            ],
          },
        ],
      },
    },
  }).encode(SECRET);

  // クライアントにトークンとアプリIDをJSON形式で返す
  res.status(200).json({ token: token, appId: APP_ID });
};