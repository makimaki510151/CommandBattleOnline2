// api/token.js

// CommonJS版のライブラリをインポート
const { SkyWayAuthToken, uuidV4 } = require('@skyway-sdk/room/dist/skyway_room.cjs.js');

const APP_ID = process.env.SKYWAY_APP_ID;
const SECRET_KEY = process.env.SKYWAY_SECRET_KEY;

// サーバーレス関数
// api/token.js
module.exports = (req, res) => {
  res.status(200).json({ message: 'Hello from Vercel!' });
};