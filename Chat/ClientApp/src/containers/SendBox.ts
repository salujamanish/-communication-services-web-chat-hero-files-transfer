import { connect } from 'react-redux';
import { Dispatch } from 'react';

import SendBox from '../components/SendBox';
import { sendMessage, sendTypingNotification, sendFile } from '../core/sideEffects';
import { MINIMUM_TYPING_INTERVAL_IN_MILLISECONDS } from '../constants';
import { State } from '../core/reducers';

const mapStateToProps = (state: State) => ({
  user: state.contosoClient.user
});

const mapDispatchToProps = (dispatch: any) => ({
  onSendMessage: (messageContent: string) => dispatch(sendMessage(messageContent)),
  onSendTypingNotification: (
    lastSentTypingNotificationDate: number,
    setLastSentTypingNotificationDate: Dispatch<number>
  ) => {
    let currentDate = new Date();
    let timeSinceLastSentTypingNotificationMs = currentDate.getTime() - lastSentTypingNotificationDate;
    if (timeSinceLastSentTypingNotificationMs >= MINIMUM_TYPING_INTERVAL_IN_MILLISECONDS) {
      dispatch(sendTypingNotification());
      setLastSentTypingNotificationDate(currentDate.getTime());
    }
  },
  onSendFile: (file: File) => dispatch(sendFile(file)),
});

export default connect(mapStateToProps, mapDispatchToProps)(SendBox);
