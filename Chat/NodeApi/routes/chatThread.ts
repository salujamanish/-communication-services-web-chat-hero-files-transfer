import express from 'express';
import { ChatClient, ChatThreadMember, CreateChatThreadRequest } from '@azure/communication-chat';
import { AzureCommunicationUserCredential } from '@azure/communication-common';
import { CommunicationUserToken } from '@azure/communication-administration';

import createFileRouter from './file';
import { FileService } from '../services/fileService';
import * as tokenManager from '../tokenManager';
import { extractApiChatGatewayUrl } from '../utils';
import { UserConfigService } from '../services/userConfigService';

interface AddUserToThreadRequestBody {
    id: string;
    displayName: string;
}

const GUID_FOR_INITIAL_TOPIC_NAME: string = "c774da81-94d5-4652-85c7-6ed0e8dc67e6";

export default function createChatThreadRouter(acsConnectionString: string, fileService: FileService, userConfigService: UserConfigService) {
    const chatGatewayUrl = extractApiChatGatewayUrl(acsConnectionString);
    const threadStore = new Map<string, CommunicationUserToken>();

    const router = express.Router();

    router.post('/', async (req, res) => {
        const moderator = await tokenManager.generateTokenAsync(acsConnectionString);

        const chatClient = new ChatClient(chatGatewayUrl, new AzureCommunicationUserCredential(moderator.token));

        const createThreadRequest: CreateChatThreadRequest = {
            topic: GUID_FOR_INITIAL_TOPIC_NAME,
            members: [
                {
                    user: moderator.user
                }
            ],
        };

        const chatThreadClient = await chatClient.createChatThread(createThreadRequest);
        threadStore.set(chatThreadClient.threadId, moderator);

        return res.status(200).send(chatThreadClient.threadId);
    });

    router.get('/:threadId', async (req, res) => {
        const threadId = req.params['threadId'];
        if (!threadStore.has(threadId)) {
            return res.sendStatus(404);
        }

        return res.sendStatus(200);
    });

    router.post('/:threadId/addUser', async (req, res) => {
        const threadId = req.params['threadId'];
        const body = req.body as AddUserToThreadRequestBody;

        try {
            const moderator = threadStore.get(threadId);
            if (moderator === undefined) {
                return res.sendStatus(404);
            }

            const moderatorCredential = new AzureCommunicationUserCredential(moderator.token);
            const chatClient = new ChatClient(chatGatewayUrl, moderatorCredential);
            const chatThread = await chatClient.getChatThread(threadId);
            const chatThreadClient = await chatClient.getChatThreadClient(threadId);

            const newChatThreadMember: ChatThreadMember = {
                user: { communicationUserId: body.id },
                displayName: body.displayName,
                shareHistoryTime: chatThread.createdOn,
            };

            try {
                const response = await chatThreadClient.addMembers({
                    members: [newChatThreadMember],
                });

                return res.sendStatus(response._response.status);
            } catch (e) {
                console.error("Unexpected error occurred while adding user from thread: ", e);
                // return res.sendStatus(e.Status);
                return res.sendStatus(400);
            }
        } catch (e) {
            console.error(`Unexpected error occurred while adding user from thread: `, e);
            return res.sendStatus(400);
        }
    });

    router.use('/:threadId/files', createFileRouter(acsConnectionString, fileService, userConfigService));

    return router;
}