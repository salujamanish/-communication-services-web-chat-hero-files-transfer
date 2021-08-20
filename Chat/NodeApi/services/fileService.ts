export interface FileService {
    uploadFile: (fileId: string, fileBuffer: Buffer) => Promise<void>;
    addFileMetadata: (threadId: string, fileMetadata: FileMetadata) => Promise<void>;
    downloadFile: (fileId: string) => Promise<NodeJS.ReadableStream>;
    getFileMetadata: (threadId: string, fileId: string) => Promise<FileMetadata>;
    getFiles: (threadId: string) => Promise<FileMetadata[]>;
}

export interface FileMetadata {
    id: string;
    name: string;
    uploadDateTime: Date;
}

export type FileServiceErrorType = 'FileNotFound';

export class FileServiceError extends Error {
    public type: FileServiceErrorType;

    constructor(type: FileServiceErrorType, message?: string) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);

        this.name = 'FileServiceError';
        this.type = type;
    }
}