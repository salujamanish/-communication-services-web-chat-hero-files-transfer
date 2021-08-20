import { connect } from 'react-redux';

import FileAttachmentMessage, { FileAttachmentMessageProps } from "../components/FileAttachmentMessage";
import { setFileBlobUrl } from '../core/actions/FilesAction';
import { State } from '../core/reducers/index';
import { getFile } from '../core/sideEffects';

const mapStateToProps = (state: State, ownProps: Pick<FileAttachmentMessageProps, 'fileId'>) => ({
  blobUrl: state.files.files.get(ownProps.fileId)?.blobUrl ?? null,
});

const mapDispatchToProps = (dispatch: any) => ({
  downloadFile: (fileId: string) => dispatch(getFile(fileId)),
  clearFileBlobUrl: (fileId: string) => dispatch(setFileBlobUrl(fileId, null)),
});

export default connect(mapStateToProps, mapDispatchToProps)(FileAttachmentMessage);