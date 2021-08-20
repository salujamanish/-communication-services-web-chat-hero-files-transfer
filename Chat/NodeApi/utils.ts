export function extractApiChatGatewayUrl(acsConnectionString: string): string {
    const urlString = acsConnectionString.replace("endpoint=", "");
    const url = new URL(urlString);
    return `${url.protocol}//${url.host}`;
}