const express = require('express');
const { SkyWayAuthToken, nowInSec } = require('@skyway-sdk/token');

const app = express();

const SKYWAY_API_KEY = 'd5450488-422b-47bf-93a0-baa8d2d3316c';
const SKYWAY_SECRET_KEY = '0yED9+rwKuxyFkAKmQqGbaOjVQcDucjM3VpBenyU3WM=';

app.get('/api/skyway-token', (req, res) => {
    const token = new SkyWayAuthToken({
        jti: 'unique-token-id',
        iat: nowInSec(),
        exp: nowInSec() + 60 * 60, // 1時間有効
        scope: {
            app: {
                id: SKYWAY_API_KEY,
                turn: true,
                actions: ['read'],
            }
        }
    }).encode(SKYWAY_SECRET_KEY);

    res.json({ token });
});

app.listen(3000, () => console.log('Server running on port 3000'));