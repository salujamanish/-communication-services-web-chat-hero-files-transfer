import { BlobServiceClient, ContainerClient, RestError } from "@azure/storage-blob";
import { TableClient, TableEntity } from "@azure/data-tables";

import { FileMetadata, FileService, FileServiceError } from "./fileService";

interface TableStorageFileMetadata {
    FileId: string;
    FileName: string;
    UploadDateTime: Date;
}

export class AzureStorageFileService implements FileService {
    constructor(
        private storageConnectionString: string,
        private blobContainerName: string,
        private tableName: string,
    ) { }

    async uploadFile(fileId: string, fileBuffer: Buffer): Promise<void> {
        const blobServiceClient = BlobServiceClient.fromConnectionString(this.storageConnectionString);
        const containerClient = blobServiceClient.getContainerClient(this.blobContainerName);
        await AzureStorageFileService.ensureBlobContainerCreated(containerClient);

        const blobClient = containerClient.getBlockBlobClient(fileId);

        await blobClient.uploadData(fileBuffer);
    }

    async addFileMetadata(threadId: string, fileMetadata: FileMetadata): Promise<void> {
        const tableClient = TableClient.fromConnectionString(this.storageConnectionString, this.tableName);
        await AzureStorageFileService.ensureTableCreated(tableClient);

        const entity: TableEntity<TableStorageFileMetadata> = {
            partitionKey: threadId,
            rowKey: fileMetadata.id,
            FileId: fileMetadata.id,
            FileName: fileMetadata.name,
            UploadDateTime: fileMetadata.uploadDateTime,
        };
        await tableClient.createEntity(entity);
    }

    async downloadFile(fileId: string): Promise<NodeJS.ReadableStream> {
        const blobServiceClient = BlobServiceClient.fromConnectionString(this.storageConnectionString);
        const containerClient = blobServiceClient.getContainerClient(this.blobContainerName);
        await AzureStorageFileService.ensureBlobContainerCreated(containerClient);
    
        const blobClient = containerClient.getBlockBlobClient(fileId);
    
        const blobDownloadResponse = await blobClient.download();
        if (blobDownloadResponse.readableStreamBody === undefined) {
            throw new FileServiceError('FileNotFound')
        }
    
        return blobDownloadResponse.readableStreamBody;
    }

    async getFileMetadata(threadId: string, fileId: string): Promise<FileMetadata> {
        const tableClient = TableClient.fromConnectionString(this.storageConnectionString, this.tableName);
        await AzureStorageFileService.ensureTableCreated(tableClient);
    
        try {
            const entityResponse = await tableClient.getEntity<TableStorageFileMetadata>(threadId, fileId);
            return {
                id: entityResponse.FileId,
                name: entityResponse.FileName,
                uploadDateTime: entityResponse.UploadDateTime,
            };
        } catch (e) {
            if (e instanceof RestError && e.statusCode === 404) {
                throw(new FileServiceError('FileNotFound'));
            }
    
            throw e;
        }
    }

    async getFiles(threadId: string): Promise<FileMetadata[]> {
        const tableClient = TableClient.fromConnectionString(this.storageConnectionString, this.tableName);
        await AzureStorageFileService.ensureTableCreated(tableClient);

        const entitiesIter = tableClient.listEntities<TableStorageFileMetadata>({
            queryOptions: {
                filter: `PartitionKey eq '${threadId}'`,
            },
        });
        const files: FileMetadata[] = [];
        for await (const entity of entitiesIter) {
            files.push({
                id: entity.FileId,
                name: entity.FileName,
                uploadDateTime: entity.UploadDateTime,
            });
        }

        return files;
    }

    private static async ensureBlobContainerCreated(containerClient: ContainerClient): Promise<void> {
        await containerClient.createIfNotExists();
    }

    private static async ensureTableCreated(tableClient: TableClient): Promise<void> {
        try {
            await tableClient.create();
        } catch (e) {
            if (e instanceof RestError && e.statusCode === 409) {
                return;
            }
    
            throw e;
        }
    }
}