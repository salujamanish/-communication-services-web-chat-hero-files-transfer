import { Dispatch } from 'redux';
import React from 'react';

import {
  MINIMUM_TYPING_INTERVAL_IN_MILLISECONDS,
  MAXIMUM_INT64,
  PAGE_SIZE,
  INITIAL_MESSAGES_SIZE,
  TOO_MANY_REQUESTS_STATUS_CODE,
  PRECONDITION_FAILED_STATUS_CODE,
  MAXIMUM_RETRY_COUNT,
  COOL_PERIOD_THRESHOLD,
  OK,
  CREATED,
  MULTI_STATUS
} from '../constants';
import { setChatClient, setContosoUser, setContosoUserCoolPeriod } from './actions/ContosoClientAction';
import { setReceipts } from './actions/ConversationsAction';
import { setMessages, setTypingNotifications, setTypingUsers, setFailedMessages } from './actions/MessagesAction';
import { setThreadId, setThread } from './actions/ThreadAction';
import {
  setThreadMembers,
  setThreadMembersError,
  setRemoveThreadMemberError,
  setAddThreadMemberError
} from './actions/ThreadMembersAction';
import { User } from './reducers/ContosoClientReducers';
import { State } from './reducers/index';
import { ExtendedChatMessage, NormalChatMessage } from './reducers/MessagesReducer';
import { compareMessages } from '../utils/utils';

import {
  ChatClient,
  ChatThreadClient,
  SendReadReceiptRequest,
  ReadReceipt,
  ChatMessage,
  GetChatMessageResponse
} from '@azure/communication-chat';
import { AzureCommunicationUserCredential, RefreshOptions } from '@azure/communication-common';
import { addFiles, setFileBlobUrl } from './actions/FilesAction';

// Represents a specially-formatted chat message for file upload
interface FileEventMessageContent {
  event: 'FileUpload',
  fileId: string,
  fileName: string,
}

// Helper function to try parsing a text chat message as a special File Event message
const parseFileEventMessageContent = (messageContent: string): FileEventMessageContent | null => {
  try {
    const parsedEvent = JSON.parse(messageContent);
    if (parsedEvent
      && typeof parsedEvent === 'object'
      && parsedEvent['event'] === 'FileUpload'
      && typeof parsedEvent['fileId'] === 'string'
      && typeof parsedEvent['fileName'] === 'string') {
        return parsedEvent as FileEventMessageContent;
    }
    
    return null;
  } catch (e) {
    return null;
  }
};

// This function sets up the user to chat with the thread
const addUserToThread = (displayName: string, emoji: string) => async (dispatch: Dispatch, getState: () => State) => {
  let state: State = getState();
  if (state.thread.threadId === undefined) {
    console.error('Thread Id not created yet');
    return;
  }
  let threadId: string = state.thread.threadId;

  // get environment url from server
  let environmentUrl = await getEnvironmentUrl();

  if (environmentUrl === undefined) {
    console.error('unable to get environment url from server');
    return;
  }
  // create our user
  let userToken = await getToken();

  if (userToken === undefined) {
    console.error('unable to get a token');
    return;
  }

 let options: RefreshOptions = {
  initialToken: userToken.token,
  tokenRefresher:  () => refreshTokenAsync(userToken.user.id),
  refreshProactively: true
 }

  let userAccessTokenCredentialNew = new AzureCommunicationUserCredential(options);
  let chatClient = new ChatClient(environmentUrl, userAccessTokenCredentialNew);

  // set emoji for the user
  setEmoji(userToken.user.id, displayName, emoji);

  // subscribe for message, typing indicator, and read receipt
  let chatThreadClient = await chatClient.getChatThreadClient(threadId);
  subscribeForMessage(chatClient, dispatch, getState);
  subscribeForTypingIndicator(chatClient, dispatch);
  subscribeForReadReceipt(chatClient, chatThreadClient, dispatch, getState);

  dispatch(setThreadId(threadId));
  dispatch(setContosoUser(userToken.user.id, userToken.token, displayName));
  dispatch(setChatClient(chatClient));

  await addThreadMemberHelper(
    threadId,
    {
      identity: userToken.user.id,
      token: userToken.token,
      displayName: displayName,
      memberRole: 'User'
    },
    dispatch
  );
};

const subscribeForTypingIndicator = async (chatClient: ChatClient, dispatch: Dispatch) => {
  await chatClient.startRealtimeNotifications();
  chatClient.on('typingIndicatorReceived', async (event) => {
    dispatch(
      setTypingNotifications(event.sender.communicationUserId, {
        from: event.sender.communicationUserId,
        originalArrivalTime: Date.parse(event.receivedOn),
        recipientId: event.recipient.communicationUserId,
        threadId: event.threadId,
        version: event.version
      })
    );
  });
};

const subscribeForMessage = async (chatClient: ChatClient, dispatch: Dispatch, getState: () => State) => {
  await chatClient.startRealtimeNotifications();
  chatClient.on('chatMessageReceived', async (event) => {
    let state: State = getState();
    let messages: ExtendedChatMessage[] = state.chat.messages !== undefined ? state.chat.messages : [];

    // If message is a file event, add the file to state
    // Also add the message to state, since the message was sent server-side and the client doesn't know about it yet
    const fileEventMessage = parseFileEventMessageContent(event.content);
    if (fileEventMessage !== null) {
      dispatch(addFiles([{
        id: fileEventMessage.fileId,
        name: fileEventMessage.fileName,
        uploadDateTime: event.createdOn,
      }]));

      const fileMessage: any = {
        ...event,
        extendedMessageType: 'FileEvent',
        fileData: {
          id: fileEventMessage.fileId,
          name: fileEventMessage.fileName,
        },
      };
      messages.push(fileMessage);
      dispatch(setMessages(messages.sort(compareMessages)));
    }

    // Also add messages to state if they were sent by other users (i.e. ignore own messages)
    else if (event.sender.communicationUserId !== state.contosoClient.user.identity) {
      const normalMessage: any = {
        ...event,
        extendedMessageType: 'None',
      };
      messages.push(normalMessage);
      dispatch(setMessages(messages.sort(compareMessages)));
    }
  });
};

const subscribeForReadReceipt = async (
  chatClient: ChatClient,
  chatThreadClient: ChatThreadClient,
  dispatch: Dispatch,
  getState: () => State
) => {
  await chatClient.startRealtimeNotifications();
  chatClient.on('readReceiptReceived', async (event) => {
    let receipts: ReadReceipt[] = [];
    for await (let page of chatThreadClient.listReadReceipts().byPage()) {
      for (const receipt of page) {
        receipts.push(receipt);
      }
    }
    dispatch(setReceipts(receipts));
  });
};

const sendTypingNotification = () => async (dispatch: Dispatch, getState: () => State) => {
  let state: State = getState();
  let chatClient = state.contosoClient.chatClient;
  if (chatClient === undefined) {
    console.error('Chat Client not created yet');
    return;
  }
  let threadId = state.thread.threadId;
  if (threadId === undefined) {
    console.error('Thread Id not created yet');
    return;
  }
  await sendTypingNotificationHelper(await chatClient.getChatThreadClient(threadId));
};

const updateTypingUsers = () => async (dispatch: Dispatch, getState: () => State) => {
  let typingUsers = [];
  let state: State = getState();
  let typingNotifications = state.chat.typingNotifications;
  for (let id in typingNotifications) {
    let typingNotification = typingNotifications[id];
    if (!typingNotification.originalArrivalTime) {
      continue;
    }
    if (shouldDisplayTyping(typingNotification.originalArrivalTime)) {
      let threadMember = state.threadMembers.threadMembers.find(
        (threadMember) => threadMember.user.communicationUserId === id
      );
      if (threadMember) {
        typingUsers.push(threadMember);
      }
    }
  }
  dispatch(setTypingUsers(typingUsers));
};

const shouldDisplayTyping = (lastReceivedTypingEventDate: number) => {
  let currentDate = new Date();
  let timeSinceLastTypingNotificationMs = currentDate.getTime() - lastReceivedTypingEventDate;
  return timeSinceLastTypingNotificationMs <= MINIMUM_TYPING_INTERVAL_IN_MILLISECONDS;
};

const sendMessage = (messageContent: string) => async (dispatch: Dispatch, getState: () => State) => {
  let state: State = getState();
  let chatClient = state.contosoClient.chatClient;
  if (chatClient === undefined) {
    console.error('Chat Client not created yet');
    return;
  }
  let threadId = state.thread.threadId;
  if (threadId === undefined) {
    console.error('Thread Id not created yet');
    return;
  }
  let displayName = state.contosoClient.user.displayName;
  let userId = state.contosoClient.user.identity;

  let clientMessageId = (Math.floor(Math.random() * MAXIMUM_INT64) + 1).toString(); //generate a random unsigned Int64 number
  let newMessage: NormalChatMessage = {
    content: messageContent,
    clientMessageId: clientMessageId,
    sender: { communicationUserId: userId },
    senderDisplayName: displayName,
    createdOn: undefined,
    extendedMessageType: 'None',
  };
  let messages = getState().chat.messages;
  messages.push(newMessage);
  dispatch(setMessages(messages));
  await sendMessageHelper(
    await chatClient.getChatThreadClient(threadId),
    threadId,
    messageContent,
    displayName,
    clientMessageId,
    dispatch,
    0,
    getState
  );
};

const isValidThread = (threadId: string) => async (dispatch: Dispatch) => {
  try {
    let validationRequestOptions = { method: 'GET' };
    let validationResponse = await fetch('/thread/' + threadId, validationRequestOptions);
    if (validationResponse.status === 200) {
      dispatch(setThreadId(threadId));
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error('Failed at getting isThreadIdValid, Error: ', error);
  }
};

const getMessages = () => async (dispatch: Dispatch, getState: () => State) => {
  let state: State = getState();
  let chatClient = state.contosoClient.chatClient;
  if (chatClient === undefined) {
    console.error('Chat Client not created yet');
    return;
  }
  let threadId = state.thread.threadId;
  if (threadId === undefined) {
    console.error('Thread Id not created yet');
    return;
  }
  let chatMessages = await getMessagesHelper(await chatClient.getChatThreadClient(threadId), threadId);
  if (chatMessages === undefined) {
    console.error('unable to get messages');
    return;
  }

  // Parse each message and check if it's a file event
  // If so, set special metadata that can be used during rendering
  const messages: ExtendedChatMessage[] = chatMessages.map(message => {
    const fileEventMessage = message.content !== undefined ? parseFileEventMessageContent(message.content) : null;
    if (fileEventMessage !== null) {
      return {
        ...message,
        extendedMessageType: 'FileEvent',
        fileData: {
          id: fileEventMessage.fileId,
          name: fileEventMessage.fileName,
        },
      };
    }

    return {
      ...message,
      extendedMessageType: 'None',
    };
  });

  return dispatch(setMessages(messages.reverse()));
};

const createThread = async () => {
  let threadId = await createThreadHelper();
  if (threadId !== null) {
    window.location.href += `?threadId=${threadId}`;
  } else {
    console.error('unable to generate a new chat thread');
  }
};

const addThreadMember = () => async (dispatch: Dispatch, getState: () => State) => {
  let state: State = getState();
  let user = state.contosoClient.user;
  let threadId = state.thread.threadId;

  if (threadId === undefined) {
    console.error('Thread Id not created yet');
    return;
  }
  await addThreadMemberHelper(
    threadId,
    {
      identity: user.identity,
      token: user.token,
      displayName: user.displayName,
      memberRole: 'User'
    },
    dispatch
  );
};

const removeThreadMemberByUserId = (userId: string) => async (dispatch: Dispatch, getState: () => State) => {
  let state: State = getState();
  let chatClient = state.contosoClient.chatClient;
  let threadId = state.thread.threadId;
  if (chatClient === undefined) {
    console.error("Chat client doesn't created yet");
    return;
  }
  if (threadId === undefined) {
    console.error('Thread Id not created yet');
    return;
  }
  let chatThreadClient = await chatClient.getChatThreadClient(threadId);
  let response = await chatThreadClient.removeMember({
    communicationUserId: userId
  });
  if (response._response.status === TOO_MANY_REQUESTS_STATUS_CODE) {
    dispatch(setRemoveThreadMemberError(true));
  }
};

const getThreadMembers = () => async (dispatch: Dispatch, getState: () => State) => {
  let state: State = getState();
  let chatClient = state.contosoClient.chatClient;
  if (chatClient === undefined) {
    console.error('Chat Client not created yet');
    return;
  }
  let threadId = state.thread.threadId;
  if (threadId === undefined) {
    console.error('Thread Id not created yet');
    return;
  }
  let chatThreadClient = await chatClient.getChatThreadClient(threadId);
  let threadMembers = await getThreadMembersHelper(chatThreadClient);
  if (threadMembers === undefined) {
    console.error('unable to get members in the thread');
    dispatch(setThreadMembersError(true));
    return;
  }
  dispatch(setThreadMembers(threadMembers));
};

const getThread = () => async (dispatch: Dispatch, getState: () => State) => {
  let state: State = getState();
  let chatClient = state.contosoClient.chatClient;
  if (chatClient === undefined) {
    console.error('Chat Client not created yet');
    return;
  }
  let threadId = state.thread.threadId;
  if (threadId === undefined) {
    console.error('Thread Id not created yet');
    return;
  }
  let thread = await getThreadHelper(chatClient, threadId);
  if (thread === undefined) {
    console.error('unable to get thread');
    return;
  }
  if (thread.members === undefined) {
    console.error('unable to get members in the thread');
    return;
  } else {
    if (
      thread.members.find((member) => member.user.communicationUserId === state.contosoClient.user.identity) ===
      undefined
    ) {
      console.error('user has been removed from the thread');
      dispatch(setThreadMembersError(true));
      return;
    }
    dispatch(setThreadMembers(thread.members.filter((threadMember) => threadMember.displayName !== undefined)));
  }
  dispatch(setThread(thread));
};

const updateThreadTopicName = (topicName: string, setIsSavingTopicName: React.Dispatch<boolean>) => async (
  dispatch: Dispatch,
  getState: () => State
) => {
  let state: State = getState();
  let chatClient = state.contosoClient.chatClient;
  if (chatClient === undefined) {
    console.error('Chat Client not created yet');
    return;
  }
  let threadId = state.thread.threadId;
  if (threadId === undefined) {
    console.error('Thread Id not created yet');
    return;
  }
  updateThreadTopicNameHelper(await chatClient.getChatThreadClient(threadId), topicName, setIsSavingTopicName);
};

// Thread Helper
const createThreadHelper = async () => {
  try {
    let createThreadRequestOptions = { method: 'POST' };
    let createThreadResponse = await fetch('/thread', createThreadRequestOptions);
    let threadId = await createThreadResponse.text();
    return threadId;
  } catch (error) {
    console.error('Failed at creating thread, Error: ', error);
  }
};

const getThreadHelper = async (chatClient: ChatClient, threadId: string) => {
  try {
    return await chatClient.getChatThread(threadId);
  } catch (error) {
    console.error('Failed at getting thread, Error: ', error);
  }
};

const updateThreadTopicNameHelper = async (
  chatThreadClient: ChatThreadClient,
  topicName: string,
  setIsSavingTopicName: React.Dispatch<boolean>
) => {
  try {
    let updateThreadRequest = {
      topic: topicName
    };
    await chatThreadClient.updateThread(updateThreadRequest);
    setIsSavingTopicName(false);
  } catch (error) {
    console.error('Failed at updating thread property, Error: ', error);
  }
};

// Thread Member Helper
const addThreadMemberHelper = async (threadId: string, user: User, dispatch: Dispatch) => {
  try {
    let body = {
      id: user.identity,
      displayName: user.displayName
    };
    let addMemberRequestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    };
    let response = await fetch('/thread/' + threadId + '/addUser', addMemberRequestOptions);
    dispatch(setAddThreadMemberError(response.status !== MULTI_STATUS));
  } catch (error) {
    console.error('Failed at adding thread member, Error: ', error);
  }
};

const getThreadMembersHelper = async (chatThreadClient: ChatThreadClient) => {
  try {
    let threadMembers = [];
    for await (let page of chatThreadClient.listMembers().byPage()) {
      for (const threadMember of page) {
        threadMembers.push(threadMember);
      }
    }
    return threadMembers.filter((threadMember) => threadMember.displayName !== undefined)!;
  } catch (error) {
    console.error('Failed at getting members, Error: ', error);
    return [];
  }
};

// Message Helper
const sendMessageHelper = async (
  chatThreadClient: ChatThreadClient,
  threadId: string,
  messageContent: string,
  displayName: string,
  clientMessageId: string,
  dispatch: Dispatch,
  retryCount: number,
  getState: () => State
) => {
  let failedMessages = getState().chat.failedMessages;
  try {
    let SendMessageRequest = {
      content: messageContent,
      senderDisplayName: displayName
    };
    chatThreadClient.sendMessage(SendMessageRequest).then(async (res) => {
      if (res._response.status === CREATED) {
        if (res.id) {
          let message: ChatMessage | undefined = await getMessageHelper(chatThreadClient, res.id, dispatch);
          if (message) {
            updateMessagesArray(dispatch, getState, {
              ...message,
              clientMessageId,
              extendedMessageType: 'None',
            });
          } else {
            updateMessagesArray(dispatch, getState, {
              clientMessageId: clientMessageId,
              createdOn: new Date(),
              id: res.id,
              extendedMessageType: 'None',
            });
          }
        }
      } else if (res._response.status === TOO_MANY_REQUESTS_STATUS_CODE) {
        dispatch(setContosoUserCoolPeriod(new Date()));
        // retry after cool period
        setTimeout(() => {
          sendMessageHelper(
            chatThreadClient,
            threadId,
            messageContent,
            displayName,
            clientMessageId,
            dispatch,
            retryCount,
            getState
          );
        }, COOL_PERIOD_THRESHOLD);
      } else if (res._response.status === PRECONDITION_FAILED_STATUS_CODE) {
        if (retryCount >= MAXIMUM_RETRY_COUNT) {
          console.error('Failed at sending message and reached max retry count');
          failedMessages.push(clientMessageId);
          setFailedMessages(failedMessages);
          return;
        }
        // retry in 0.2s
        setTimeout(() => {
          sendMessageHelper(
            chatThreadClient,
            threadId,
            messageContent,
            displayName,
            clientMessageId,
            dispatch,
            retryCount + 1,
            getState
          );
        }, 200);
      } else {
        failedMessages.push(clientMessageId);
        setFailedMessages(failedMessages);
      }
    });
  } catch (error) {
    console.error('Failed at sending message, Error: ', error);
    failedMessages.push(clientMessageId);
    setFailedMessages(failedMessages);
  }
};

const updateMessagesArray = async (
  dispatch: Dispatch,
  getState: () => State,
  newMessage: ExtendedChatMessage
) => {
  let state: State = getState();
  let messages: ExtendedChatMessage[] = state.chat.messages !== undefined ? state.chat.messages : [];
  messages = messages.map((message: ExtendedChatMessage) => {
    if (message.clientMessageId === newMessage.clientMessageId) {
      return {
        ...message,
        ...newMessage
      };
    } else {
      return message;
    }
  });
  dispatch(setMessages(messages.sort(compareMessages)));
};

const getMessageHelper = async (chatThreadClient: ChatThreadClient, messageId: string, dispatch: Dispatch) => {
  try {
    let messageResponse: GetChatMessageResponse = await chatThreadClient.getMessage(messageId);
    if (messageResponse._response.status === OK) {
      let chatMessage: ChatMessage = messageResponse;
      return chatMessage;
    } else if (messageResponse._response.status === TOO_MANY_REQUESTS_STATUS_CODE) {
      return undefined;
    }
  } catch (error) {
    console.error('Failed at getting messages, Error: ', error);
  }
};

const getMessagesHelper = async (chatThreadClient: ChatThreadClient, threadId: string) => {
  try {
    let messages: ChatMessage[] = [];
    let getMessagesResponse = await chatThreadClient.listMessages({
      maxPageSize: PAGE_SIZE
    });

    let messages_temp = [];

    for await (let page of getMessagesResponse.byPage()) {
      for (const message of page) {
        messages_temp.push(message);
      }
    }

    while (true) {
      if (messages_temp === undefined) {
        console.error('Unable to get messages from server');
        return;
      }

      // filter and only return top 100 text messages
      messages.push(...messages_temp.filter((message) => message.type === 'Text'));
      if (messages.length >= INITIAL_MESSAGES_SIZE) {
        return messages.slice(0, INITIAL_MESSAGES_SIZE);
      }
      // if there is no more messages
      break;
    }

    return messages.slice(0, INITIAL_MESSAGES_SIZE);
  } catch (error) {
    console.error('Failed at getting messages, Error: ', error);
  }
};

// Typing Notification Helper
const sendTypingNotificationHelper = async (chatThreadClient: ChatThreadClient) => {
  try {
    await chatThreadClient.sendTypingNotification();
  } catch (error) {
    console.error('Failed at sending typing notification, Error: ', error);
  }
};

const getEnvironmentUrl = async () => {
  try {
    let getRequestOptions = {
      method: 'GET'
    };
    let response = await fetch('/getEnvironmentUrl', getRequestOptions);
    return response.text().then((environmentUrl) => environmentUrl);
  } catch (error) {
    console.error('Failed at getting environment url, Error: ', error);
  }
};

// Token Helper
const getToken = async () => {
  try {
    let getTokenRequestOptions = {
      method: 'POST'
    };
    let getTokenResponse = await fetch('/token', getTokenRequestOptions);
    return getTokenResponse.json().then((_responseJson) => _responseJson);
  } catch (error) {
    console.error('Failed at getting token, Error: ', error);
  }
};

const refreshTokenAsync = async (userIdentity: string) : Promise<string>=> {
  return new Promise<string>((resolve, reject) => {
    return fetch('/token/'+ userIdentity + '/refresh').then(response => {
      if (response.ok) {
        resolve(response.json().then(json => json.token))
      } else {
        reject(new Error('error'))
      }
    }, error => {
      reject(new Error(error.message))
    })
  })
}

const setEmoji = async (userId: string, name: string, emoji: string) => {
  try {
    let getTokenRequestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Name: name, Emoji: emoji })
    };
    await (await fetch('/userConfig/' + userId, getTokenRequestOptions)).json;
  } catch (error) {
    console.error('Failed at setting emoji, Error: ', error);
  }
};

const getEmoji = async (userId: string) => {
  try {
    let getTokenRequestOptions = {
      headers: { 'Content-Type': 'application/json' },
      method: 'GET'
    };
    return await (await fetch('/userConfig/' + userId, getTokenRequestOptions)).json();
  } catch (error) {
    console.error('Failed at getting emoji, Error: ', error);
  }
};

const sendReadReceipt = (messageId: string) => async (dispatch: Dispatch, getState: () => State) => {
  // This is sent when we get focus to this tab and see this message
  let state: State = getState();
  let chatClient = state.contosoClient.chatClient;
  if (chatClient === undefined) {
    console.error('Chat Client not created yet');
    return;
  }
  let threadId = state.thread.threadId;
  if (threadId === undefined) {
    console.error('Thread Id not created yet');
    return;
  }
  await sendReadReceiptHelper(await chatClient.getChatThreadClient(threadId), messageId);
};

const sendReadReceiptHelper = async (chatThreadClient: ChatThreadClient, messageId: string) => {
  let postReadReceiptRequest: SendReadReceiptRequest = {
    chatMessageId: messageId
  };
  await chatThreadClient.sendReadReceipt(postReadReceiptRequest);
};

// Files
const sendFile = (file: File) => async (dispatch: Dispatch, getState: () => State) => {
  const state = getState();
  const userId = state.contosoClient.user.identity;
  const userDisplayName = state.contosoClient.user.displayName;
  const threadId = state.thread.threadId;
  if (threadId === undefined) {
    return false;
  }

  const data = new FormData();
  data.append('file', file);
  data.append('fileName', file.name);
  data.append('userId', userId);

  const sendFileRequestOptions: RequestInit = {
    method: 'POST',
    body: data,
  };

  try {
    const sendFileResponse = await fetch(`/thread/${threadId}/files`, sendFileRequestOptions);
    return sendFileResponse.ok;
  } catch (error) {
    console.error('Failed to send file: ', error);
    return false;
  }
};

const getFile = (fileId: string) => async (dispatch: Dispatch, getState: () => State) => {
  const state = getState();
  const threadId = state.thread.threadId;

  const response = await fetch(`/thread/${threadId}/files/${fileId}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  // Update file with new blob URL
  dispatch(setFileBlobUrl(fileId, objectUrl));
};

const getAllFiles = () => async (dispatch: Dispatch, getState: () => State) => {
  const threadId = getState().thread.threadId;

  const response = await fetch(`/thread/${threadId}/files`);
  if (!response.ok) {
    console.error(`Failed to fetch initial files with status ${response.status}`);
    return;
  }

  const responseJson: { id: string, name: string, uploadDateTime: string }[] = await response.json();

  // Update files in state with fetched files
  dispatch(addFiles(responseJson));
};

export {
  sendMessage,
  getMessages,
  createThread,
  addThreadMember,
  getThreadMembers,
  addUserToThread,
  removeThreadMemberByUserId,
  getEmoji,
  setEmoji,
  sendReadReceipt,
  sendTypingNotification,
  updateTypingUsers,
  isValidThread,
  updateThreadTopicName,
  getThread,
  sendFile,
  getFile,
  getAllFiles,
};
