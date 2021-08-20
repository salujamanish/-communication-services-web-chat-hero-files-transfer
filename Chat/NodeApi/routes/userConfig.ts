import express from 'express';
import { ContosoUserConfigModel, UserConfigService, UserConfigServiceError } from '../services/userConfigService';

interface UserConfigRequestBody {
    Name: string;
    Emoji: string;
}

export default function createUserConfigRouter(userConfigService: UserConfigService) {
    const router = express.Router();

    router.post('/:userId', async (req, res) => {
        const userId = req.params['userId'];
        const body = req.body as UserConfigRequestBody;

        try {
            await userConfigService.addUser(userId, { name: body.Name, emoji: body.Emoji });
        } catch (e) {
            if (e instanceof UserConfigServiceError && e.type === 'UserAlreadyExists') {
                return res.sendStatus(400);
            }
        }

        return res.sendStatus(200);
    });

    router.get('/:userId', async (req, res) => {
        const userId = req.params['userId'];

        let user: ContosoUserConfigModel;
        try {
            user = await userConfigService.getUser(userId);
        } catch (e) {
            if (e instanceof UserConfigServiceError && e.type === 'UserNotFound') {
                return res.sendStatus(404);
            }
            
            throw e;
        }

        return res.status(200).send(user);
    });

    return router;
}