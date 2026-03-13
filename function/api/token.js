export async function onRequest(context) {
  const { env } = context;
  const appId = env.SKYWAY_APP_ID;
  const secret = env.SKYWAY_SECRET;

  if (!appId || !secret) {
    return new Response(JSON.stringify({ error: "Environment variables not set" }), { status: 500 });
  }

  // SkyWay Auth Tokenの最小構成JS実装（ライブラリなしで署名を行う例）
  // 簡易化のため、ここでは構造の定義のみ行います
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    exp: now + 3600, // 1時間有効
    scope: {
      appId: appId,
      rooms: [{
        name: "*",
        methods: ["create", "delete", "aggregate"],
        members: [{
          name: "*",
          methods: ["create", "delete", "update", "subscribe", "publish"],
          publication: { methods: ["create", "delete", "update"] },
          subscription: { methods: ["create", "delete"] },
        }]
      }]
    }
  };

  // 本来はここでWeb Crypto APIを使用してHS256署名を行いますが、
  // デプロイ時は公式の @skyway-sdk/token ライブラリをビルドに含めるのが推奨です。
  // ここではフロントエンドが受け取るべき形式をレスポンスします。
  return new Response(JSON.stringify({
    appId: appId,
    token: "SERVER_GENERATED_TOKEN" // 実際には署名済みの値を返却
  }), {
    headers: { "Content-Type": "application/json" }
  });
}