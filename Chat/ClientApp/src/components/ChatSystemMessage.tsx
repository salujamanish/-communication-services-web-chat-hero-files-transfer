import React from 'react';

import {
  ChatSystemMessageContainerStyle,
  ChatSystemMessageTextStyle,
} from './styles/ChatSystemMessage.styles';

interface ChatSystemMessage {
  generateCoolPeriod(): string;
  textValueOverflow: boolean;
  fileTooLarge: boolean;
}

export default (props: ChatSystemMessage): JSX.Element => {
  const coolPeriodMessage = props.generateCoolPeriod();

  const messageElements: JSX.Element[] = [];
  const emptyMessageElements: JSX.Element[] = [];

  const addEmptyMessageElement = () => {
    emptyMessageElements.push(<div className={ChatSystemMessageContainerStyle(true)} />);
  }

  props.fileTooLarge
    ? messageElements.push(
      <div className={ChatSystemMessageContainerStyle(true)}>
        <div className={ChatSystemMessageTextStyle}>
          Warning: The selected file is over the size limit of 5 MB.
        </div>
      </div>
    )
    : addEmptyMessageElement();
  
  props.textValueOverflow
    ? messageElements.push(
      <div className={ChatSystemMessageContainerStyle(true)}>
        <div className={ChatSystemMessageTextStyle}>
          Warning: Your message is over the limit of 8000 characters
        </div>
      </div>
    )
    : addEmptyMessageElement();
  
  coolPeriodMessage !== ''
    ? messageElements.push(
      <div className={ChatSystemMessageContainerStyle(true)}>
        <span className={ChatSystemMessageTextStyle}>
          {coolPeriodMessage}
        </span>
      </div>
    )
    : addEmptyMessageElement();
  
  if (messageElements.length === 0) {
    return <div className={ChatSystemMessageContainerStyle(false)} />;
  }

  return <> {messageElements.concat(emptyMessageElements)} </>;
};
