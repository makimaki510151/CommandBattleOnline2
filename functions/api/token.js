export async function onRequest(context) {
    const { env } = context;
    const appId = env.SKYWAY_APP_ID;
    const secret = env.SKYWAY_SECRET;

    if (!appId || !secret) {
        return new Response(JSON.stringify({ error: "Environment variables not set" }), { status: 500 });
    }

    try {
        const token = await createSkyWayToken(appId, secret);
        return new Response(JSON.stringify({ token }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

async function createSkyWayToken(appId, secret) {
    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);

    // SkyWayが必須とするフィールドをすべて網羅
    const payload = {
        version: 3,
        iat: now,
        exp: now + 3600,
        jti: crypto.randomUUID(), // これが欠けるとデコードエラーになります
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

    const encoder = new TextEncoder();
    const encodedHeader = b64UrlEncode(encoder.encode(JSON.stringify(header)));
    const encodedPayload = b64UrlEncode(encoder.encode(JSON.stringify(payload)));

    const rawSecret = Uint8Array.from(atob(secret), c => c.charCodeAt(0));

    const key = await crypto.subtle.importKey(
        "raw",
        rawSecret,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(dataToSign));
    const encodedSignature = b64UrlEncode(new Uint8Array(signature));

    return `${dataToSign}.${encodedSignature}`;
}

function b64UrlEncode(u8arr) {
    const binstr = String.fromCharCode(...u8arr);
    return btoa(binstr)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}