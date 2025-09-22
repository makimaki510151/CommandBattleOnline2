// api/token.js
const { SkyWayAuthToken, uuidV4 } = require('@skyway-sdk/token');

const APP_ID = process.env.VITE_SKYWAY_APP_ID;
const SECRET = process.env.VITE_SKYWAY_SECRET_KEY;

module.exports = (req, res) => {
  if (!APP_ID || !SECRET) {
    console.error("Environment variables for SkyWay are not set.");
    res.status(500).json({ error: "Server configuration error: missing credentials." });
    return;
  }

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

  // トークンと一緒にアプリIDも返す
  res.status(200).json({ token: token, appId: APP_ID });
};