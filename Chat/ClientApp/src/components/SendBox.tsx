import { Stack, TextField } from '@fluentui/react';
import { PaperclipIcon, SendIcon } from '@fluentui/react-northstar';
import React, { useState, Dispatch, useRef } from 'react';

import {
  ENTER_KEY,
  EMPTY_MESSAGE_REGEX,
  COOL_PERIOD_THRESHOLD,
  MAXIMUM_LENGTH_OF_MESSAGE,
} from '../../src/constants';
import {
  sendBoxStyle,
  sendActionIconStyle,
  textFieldStyle,
  TextFieldStyleProps
} from './styles/SendBox.styles';
import { User } from '../core/reducers/ContosoClientReducers';
import ChatSystemMessage from '../containers/ChatSystemMessage';

interface SendboxProps {
  onSendMessage(messageContent: string): void;
  onSendTypingNotification(
    lastSentTypingNotificationDate: number,
    setLastSentTypingNotificationDate: Dispatch<number>
  ): void;
  onSendFile(file: File): void;
  user: User;
}

export default (props: SendboxProps): JSX.Element => {
  const hiddenFileInput = useRef<HTMLInputElement>(null);
  const [fileTooLarge, setFileTooLarge] = useState<boolean>(false);
  const [textValue, setTextValue] = useState('');
  const [textValueOverflow, setTextValueOverflow] = useState(false);
  const [
    lastSentTypingNotificationDate,
    setLastSentTypingNotificationDate,
  ] = useState(0);

  const addMessage = () => {
    if (props.user.coolPeriod !== undefined) {
      let waitTime = new Date().getTime() - props.user.coolPeriod.getTime();
      if (waitTime < COOL_PERIOD_THRESHOLD) {
        return;
      }
    }
    // we dont want to send empty messages including spaces, newlines, tabs
    if (!EMPTY_MESSAGE_REGEX.test(textValue)) {
      props.onSendMessage(textValue);
      setTextValue('');
    }
  };
  const setText = (e: any) => {
    if (e.target.value.length > MAXIMUM_LENGTH_OF_MESSAGE) {
      setTextValueOverflow(true);
    } else {
      setTextValueOverflow(false);
    }
    setTextValue(e.target.value);
  };
  
  const fileChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files === null || event.target.files.length === 0) {
      return;
    }

    const file = event.target.files[0];
    if (file.size > 5 * 1024 * 1024) {
      setFileTooLarge(true);
    } else {
      setFileTooLarge(false);
      props.onSendFile(file);
    }

    // Reset the file input so that choosing the same file again still triggers the onChange handler
    event.target.value = "";
  };

  return (
    <div>
      <Stack horizontal={true}>
        <TextField
          className={textFieldStyle}
          id="sendbox"
          borderless={true}
          ariaLabel={'Type'}
          inputClassName={sendBoxStyle}
          placeholder="Type your message"
          value={textValue}
          onChange={setText}
          autoComplete="off"
          onKeyUp={(ev) => {
            if (ev.which === ENTER_KEY && !textValueOverflow) {
              addMessage();
            }
            props.onSendTypingNotification(
              lastSentTypingNotificationDate,
              setLastSentTypingNotificationDate
            );
          }}
          styles={TextFieldStyleProps}
        />
        <PaperclipIcon
          outline
          className={sendActionIconStyle}
          onClick={() => {
            if (hiddenFileInput.current !== null) {
              hiddenFileInput.current.click();
            }
          }}
        />
        <SendIcon
          outline
          className={sendActionIconStyle}
          onClick={() => {
            if (!textValueOverflow) {
              addMessage();
            }
          }}
        />
      </Stack>
      <ChatSystemMessage textValueOverflow={textValueOverflow} fileTooLarge={fileTooLarge} />
      <input
        ref={hiddenFileInput}
        type="file"
        onChange={fileChanged}
        style={{ display: 'none' }}
      />
    </div>
  );
};
