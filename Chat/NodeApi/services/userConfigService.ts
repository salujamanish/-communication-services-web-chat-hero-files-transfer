export interface UserConfigService {
    addUser(userId: string, user: ContosoUserConfigModel): Promise<void>;
    getUser(userId: string): Promise<ContosoUserConfigModel>;
}

export interface ContosoUserConfigModel {
    name: string;
    emoji: string;
}

export type UserConfigServiceErrorType = 'UserNotFound' | 'UserAlreadyExists';

export class UserConfigServiceError extends Error {
    public type: UserConfigServiceErrorType;

    constructor(type: UserConfigServiceErrorType, message?: string) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);

        this.name = 'UserConfigServiceError';
        this.type = type;
    }
}