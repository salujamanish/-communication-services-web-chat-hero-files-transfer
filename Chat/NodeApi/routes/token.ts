import express from 'express';

import * as tokenManager from '../tokenManager';

export default function createTokenRouter(acsConnectionString: string) {
    const router = express.Router();

    router.post('/', async (req, res) => {
        const token = await tokenManager.generateTokenAsync(acsConnectionString);
        res.status(200).send({
            expiresOn: token.expiresOn,
            token: token.token,
            user: {
                id: token.user.communicationUserId,
            }
        });
    });

    router.get('/:userIdentity/refresh', async (req, res) => {
        const userIdentity = req.params['userIdentity'];
        const token = await tokenManager.refreshTokenAsync(acsConnectionString, userIdentity);
        res.status(200).send(token);
    });

    return router;
}