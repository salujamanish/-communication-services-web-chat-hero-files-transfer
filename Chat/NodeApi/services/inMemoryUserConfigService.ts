import { ContosoUserConfigModel, UserConfigService, UserConfigServiceError } from "./userConfigService";

export class InMemoryUserConfigService implements UserConfigService {
    private userStore = new Map<string, ContosoUserConfigModel>();

    addUser(userId: string, user: ContosoUserConfigModel): Promise<void> {
        if (this.userStore.has(userId)) {
            throw new UserConfigServiceError('UserAlreadyExists');
        }

        this.userStore.set(userId, user);

        return Promise.resolve();
    }

    getUser(userId: string): Promise<ContosoUserConfigModel> {
        const user = this.userStore.get(userId);
        if (user === undefined) {
            throw new UserConfigServiceError('UserNotFound');
        }

        return Promise.resolve(user);
    }

}