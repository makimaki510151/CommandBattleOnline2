// api/pusher-auth.js

// Pusherのライブラリをインポート
import Pusher from 'pusher';

export default async function handler(req, res) {
    // ⚠️ 環境変数を安全に取得
    const PUSHER_APP_ID = process.env.PUSHER_APP_ID;
    const PUSHER_KEY = process.env.PUSHER_KEY;
    const PUSHER_SECRET = process.env.PUSHER_SECRET;
    const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER;

    // POSTリクエストのみを許可
    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Method Not Allowed' });
        return;
    }

    // クライアントから送信されたデータを取得
    const { socket_id, channel_name } = req.body;
    
    // 認証用のPusherインスタンスを作成
    const pusher = new Pusher({
        appId: PUSHER_APP_ID,
        key: PUSHER_KEY,
        secret: PUSHER_SECRET,
        cluster: PUSHER_CLUSTER,
        useTLS: true,
    });

    // プライベートチャンネルの認証を実行
    const auth = pusher.authorizeChannel(socket_id, channel_name);

    // 認証トークンをクライアントに返却
    res.status(200).send(auth);
}