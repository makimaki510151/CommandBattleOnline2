// api/pusher-auth.js

import Pusher from 'pusher';

export default async function handler(req, res) {
    const PUSHER_APP_ID = process.env.PUSHER_APP_ID;
    const PUSHER_KEY = process.env.PUSHER_KEY;
    const PUSHER_SECRET = process.env.PUSHER_SECRET;
    const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER;

    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Method Not Allowed' });
        return;
    }

    const { socket_id, channel_name } = req.body;
    
    // pusherの認証用インスタンスを作成
    const pusher = new Pusher({
        appId: PUSHER_APP_ID,
        key: PUSHER_KEY,
        secret: PUSHER_SECRET,
        cluster: PUSHER_CLUSTER,
        useTLS: true,
    });

    try {
        const auth = pusher.authorizeChannel(socket_id, channel_name);
        res.status(200).send(auth);
    } catch (error) {
        console.error('Pusher authentication failed:', error);
        res.status(500).json({ message: 'Authentication failed', error: error.message });
    }
}