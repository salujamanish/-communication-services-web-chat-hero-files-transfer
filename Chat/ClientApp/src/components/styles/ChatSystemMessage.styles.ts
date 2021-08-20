import { mergeStyles } from '@fluentui/react';

const ChatSystemMessageContainerStyle = (hasWarning: boolean) =>
  mergeStyles({
    height: hasWarning ? '1.25rem' : '3.75rem',
    display: 'flex',
    alignItems: 'center'
  });

const ChatSystemMessageTextStyle = mergeStyles({
  fontWeight: 400,
  whiteSpace: 'nowrap',
  color: 'red'
});

export { ChatSystemMessageContainerStyle, ChatSystemMessageTextStyle };
