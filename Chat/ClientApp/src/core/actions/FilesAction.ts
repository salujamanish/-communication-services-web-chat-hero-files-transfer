export const ADD_FILES = 'ADD_FILES';
export const SET_FILE_BLOB_URL = 'SET_FILE_BLOB_URL';

interface FileToAdd {
    id: string;
    name: string;
    uploadDateTime: string;
}

export interface AddFilesAction {
    type: typeof ADD_FILES;
    files: FileToAdd[];
}

export interface SetFileBlobUrlAction {
    type: typeof SET_FILE_BLOB_URL;
    fileId: string;
    blobUrl: string | null;
}

export const addFiles = (files: FileToAdd[]): AddFilesAction => {
    return {
        type: ADD_FILES,
        files,
    };
};

export const setFileBlobUrl = (fileId: string, blobUrl: string | null): SetFileBlobUrlAction => {
    return {
        type: SET_FILE_BLOB_URL,
        fileId,
        blobUrl
    };
};

export type FilesActionTypes =
    | AddFilesAction
    | SetFileBlobUrlAction;