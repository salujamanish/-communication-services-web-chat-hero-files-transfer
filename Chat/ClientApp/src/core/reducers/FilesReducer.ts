import { Reducer } from 'redux';
import { FilesActionTypes, ADD_FILES, SET_FILE_BLOB_URL } from '../actions/FilesAction';

export interface FilesStateFile {
    name: string;
    uploadDateTime: string;
    blobUrl: string | null;
}

export interface FilesState {
    files: Map<string, FilesStateFile>,
}

const initialState: FilesState = {
    files: new Map<string, FilesStateFile>(),
};

export const FilesReducer: Reducer<FilesState, FilesActionTypes> = (state = initialState, action: FilesActionTypes): FilesState => {
    switch (action.type) {
        case ADD_FILES: {
            const copiedFilesMap = new Map<string, FilesStateFile>(state.files);
            for (const fileToAdd of action.files) {
                // Ignore files that we already know about
                if (copiedFilesMap.has(fileToAdd.id)) continue;

                copiedFilesMap.set(fileToAdd.id, {
                    name: fileToAdd.name,
                    uploadDateTime: fileToAdd.uploadDateTime,
                    blobUrl: null,
                });
            }

            return { ...state, files: copiedFilesMap };
        }
        case SET_FILE_BLOB_URL: {
            const currentFile = state.files.get(action.fileId);
            if (currentFile === undefined) return state;

            const copiedFilesMap = new Map<string, FilesStateFile>(state.files);
            copiedFilesMap.set(action.fileId, {
                ...currentFile,
                blobUrl: action.blobUrl,
            });

            return { ...state, files: copiedFilesMap };
        }
        default:
            return state;
    }
};