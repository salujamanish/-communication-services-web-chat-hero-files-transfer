import { CommunicationIdentityClient, CommunicationUserToken } from "@azure/communication-administration"
import { CommunicationUser } from "@azure/communication-common";

export async function generateTokenAsync(acsConnectionString: string): Promise<CommunicationUserToken> {
    const communicationIdentityClient = new CommunicationIdentityClient(acsConnectionString);
    const userResponse = await communicationIdentityClient.createUser();
    const tokenResponse = await communicationIdentityClient.issueToken(userResponse, ["chat"]);
    return tokenResponse;
}

export async function refreshTokenAsync(acsConnectionString: string, identity: string): Promise<CommunicationUserToken> {
    const communicationIdentityClient = new CommunicationIdentityClient(acsConnectionString);
    const user: CommunicationUser = { communicationUserId: identity };
    const tokenResponse = await communicationIdentityClient.issueToken(user, ["chat"]);
    return tokenResponse;
}