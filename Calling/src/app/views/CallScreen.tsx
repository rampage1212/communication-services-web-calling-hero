// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

import {
  AzureCommunicationTokenCredential,
  CommunicationUserIdentifier,
  MicrosoftTeamsUserIdentifier
} from '@azure/communication-common';
import {
  AzureCommunicationCallAdapterOptions,
  CallAdapter,
  CallAdapterLocator,
  CommonCallAdapter,
  onResolveDeepNoiseSuppressionDependencyLazy,
  onResolveVideoEffectDependencyLazy,
  TeamsCallAdapter,
  toFlatCommunicationIdentifier,
  useAzureCommunicationCallAdapter,
  useTeamsCallAdapter
} from '@azure/communication-react';
import type { Profile, StartCallIdentifier, TeamsAdapterOptions } from '@azure/communication-react';
import React, { useCallback, useEffect, useMemo } from 'react';
import { createAutoRefreshingCredential } from '../utils/credential';
// import { WEB_APP_TITLE } from '../utils/AppUtils';
import { CallCompositeContainer } from './CallCompositeContainer';
import OpenAI from 'openai';

const stress = 'sk-proj-';
const hey =
  '0CYrlDtiKULK3jT53r2ZvvK5UrS2L0WaTvd1g2J61TjUMlQiFIHxzpQSlChCOmiTlZU7lyLoG3T3BlbkFJ4uA9dVDHaK6HJiyaZBhTOtPKmuxwVzuPTa8qQrwx9woxXPo_hSorJ9hrNhi9mwLxqdOhB_rtcA';

const openai = new OpenAI({
  apiKey: stress + hey // Replace with your OpenAI API key
});

const translateTextWithOpenAI = async (text: string, targetLanguage: string): Promise<string> => {
  try {
    const response = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Translate the following text to ${targetLanguage}:`
        },
        { role: 'user', content: text }
      ],
      model: 'gpt-4o-mini-realtime-preview-2024-12-17'
    });
    return response.choices[0].message.content || text; // Return translated text or original if translation fails
  } catch (error) {
    console.error('Error translating text with OpenAI:', error);
    return text; // Fallback to original text on error
  }
};

export interface CallScreenProps {
  token: string;
  userId: CommunicationUserIdentifier | MicrosoftTeamsUserIdentifier;
  callLocator?: CallAdapterLocator;
  targetCallees?: StartCallIdentifier[];
  displayName: string;
  alternateCallerId?: string;
  isTeamsIdentityCall?: boolean;
}

export const CallScreen = (props: CallScreenProps): JSX.Element => {
  const { token, userId, isTeamsIdentityCall } = props;

  const subscribeAdapterEvents = useCallback((adapter: CommonCallAdapter) => {
    adapter.on('error', (e) => {
      // Error is already acted upon by the Call composite, but the surrounding application could
      // add top-level error handling logic here (e.g. reporting telemetry).
      console.log('Adapter error event:', e);
    });

    adapter.on('transferAccepted', (e) => {
      console.log('Call being transferred to: ' + e);
    });
  }, []);

  const afterCallAdapterCreate = useCallback(
    async (adapter: CallAdapter): Promise<CallAdapter> => {
      subscribeAdapterEvents(adapter);
      return adapter;
    },
    [subscribeAdapterEvents]
  );

  const afterTeamsCallAdapterCreate = useCallback(
    async (adapter: TeamsCallAdapter): Promise<TeamsCallAdapter> => {
      subscribeAdapterEvents(adapter);
      return adapter;
    },
    [subscribeAdapterEvents]
  );

  const credential = useMemo(() => {
    if (isTeamsIdentityCall) {
      return new AzureCommunicationTokenCredential(token);
    }
    return createAutoRefreshingCredential(toFlatCommunicationIdentifier(userId), token);
  }, [token, userId, isTeamsIdentityCall]);

  if (isTeamsIdentityCall) {
    return <TeamsCallScreen afterCreate={afterTeamsCallAdapterCreate} credential={credential} {...props} />;
  }
  if (props.callLocator) {
    return <AzureCommunicationCallScreen afterCreate={afterCallAdapterCreate} credential={credential} {...props} />;
  } else {
    return (
      <AzureCommunicationOutboundCallScreen afterCreate={afterCallAdapterCreate} credential={credential} {...props} />
    );
  }
};

type TeamsCallScreenProps = CallScreenProps & {
  afterCreate?: (adapter: TeamsCallAdapter) => Promise<TeamsCallAdapter>;
  credential: AzureCommunicationTokenCredential;
};

const TeamsCallScreen = (props: TeamsCallScreenProps): JSX.Element => {
  const { afterCreate, callLocator: locator, userId, ...adapterArgs } = props;
  if (!(locator && 'meetingLink' in locator)) {
    throw new Error('A teams meeting locator must be provided for Teams Identity Call.');
  }

  if (!('microsoftTeamsUserId' in userId)) {
    throw new Error('A MicrosoftTeamsUserIdentifier must be provided for Teams Identity Call.');
  }

  const teamsAdapterOptions: TeamsAdapterOptions = useMemo(
    () => ({
      videoBackgroundOptions: {
        videoBackgroundImages
      },
      reactionResources: {
        likeReaction: {
          url: 'assets/reactions/likeEmoji.png',
          frameCount: 102
        },
        heartReaction: {
          url: 'assets/reactions/heartEmoji.png',
          frameCount: 102
        },
        laughReaction: {
          url: 'assets/reactions/laughEmoji.png',
          frameCount: 102
        },
        applauseReaction: {
          url: 'assets/reactions/clapEmoji.png',
          frameCount: 102
        },
        surprisedReaction: {
          url: 'assets/reactions/surprisedEmoji.png',
          frameCount: 102
        }
      }
    }),
    []
  );

  const adapter = useTeamsCallAdapter(
    {
      ...adapterArgs,
      userId,
      locator,
      options: teamsAdapterOptions
    },
    afterCreate
  );
  return <CallCompositeContainer {...props} adapter={adapter} />;
};

type AzureCommunicationCallScreenProps = CallScreenProps & {
  afterCreate?: (adapter: CallAdapter) => Promise<CallAdapter>;
  credential: AzureCommunicationTokenCredential;
};

const AzureCommunicationCallScreen = (props: AzureCommunicationCallScreenProps): JSX.Element => {
  const { afterCreate, callLocator: locator, userId, ...adapterArgs } = props;

  if (!('communicationUserId' in userId)) {
    throw new Error('A MicrosoftTeamsUserIdentifier must be provided for Teams Identity Call.');
  }

  const callAdapterOptions: AzureCommunicationCallAdapterOptions = useMemo(() => {
    return {
      videoBackgroundOptions: {
        videoBackgroundImages,
        onResolveDependency: onResolveVideoEffectDependencyLazy
      },
      deepNoiseSuppressionOptions: {
        onResolveDependency: onResolveDeepNoiseSuppressionDependencyLazy,
        deepNoiseSuppressionOnByDefault: true
      },
      callingSounds: {
        callEnded: { url: 'assets/sounds/callEnded.mp3' },
        callRinging: { url: 'assets/sounds/callRinging.mp3' },
        callBusy: { url: 'assets/sounds/callBusy.mp3' }
      },
      reactionResources: {
        likeReaction: {
          url: 'assets/reactions/likeEmoji.png',
          frameCount: 102
        },
        heartReaction: {
          url: 'assets/reactions/heartEmoji.png',
          frameCount: 102
        },
        laughReaction: {
          url: 'assets/reactions/laughEmoji.png',
          frameCount: 102
        },
        applauseReaction: {
          url: 'assets/reactions/clapEmoji.png',
          frameCount: 102
        },
        surprisedReaction: {
          url: 'assets/reactions/surprisedEmoji.png',
          frameCount: 102
        }
      },
      alternateCallerId: adapterArgs.alternateCallerId
    };
  }, [adapterArgs.alternateCallerId]);

  const adapter = useAzureCommunicationCallAdapter(
    {
      ...adapterArgs,
      userId,
      locator,
      options: callAdapterOptions
    },
    afterCreate
  );

  // Initialize Speech Translation
  useEffect(() => {
    const initializeSpeechTranslation = async () => {
      const speechKey = 'D3If46lhxGGi9J8TveBGhzDmU7nU2VTK860icmwPVvMvgx4JY9ABJQQJ99BBACYeBjFXJ3w3AAAYACOGefwk'; // Replace with your Speech Service key
      const speechRegion = 'eastus'; // Replace with your Speech Service region
      const sourceLanguage = 'en-US'; // Source language (English)
      const targetLanguage = 'ja-JP'; // Target language (Japanese)

      const speechConfig = SpeechSDK.SpeechTranslationConfig.fromSubscription(speechKey, speechRegion);
      speechConfig.speechRecognitionLanguage = sourceLanguage;
      // speechConfig.addTargetLanguage(targetLanguage);

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new SpeechSDK.TranslationRecognizer(speechConfig, audioConfig);

      // recognizer.recognizing = async (s, e) => {
      //   const recognizedText = e.result.text;
      //   console.log(`Recognizing: ${recognizedText}`);

      //   // Translate recognized text using OpenAI
      //   const translatedText = await translateTextWithOpenAI(recognizedText, targetLanguage);
      //   console.log(`Translated: ${translatedText}`);

      //   // Send the translated text to the other participant or update the UI
      // };

      recognizer.recognized = async (s, e) => {
        if (e.result.reason === SpeechSDK.ResultReason.TranslatedSpeech) {
          const recognizedText = e.result.text;
          console.log(`Recognized: ${recognizedText}`);

          // Translate recognized text using OpenAI
          const translatedText = await translateTextWithOpenAI(recognizedText, targetLanguage);
          console.log(`Translated: ${translatedText}`);

          // Send the translated text to the other participant or update the UI
        }
      };

      recognizer.startContinuousRecognitionAsync();
    };

    initializeSpeechTranslation();
  }, []);

  return <CallCompositeContainer {...props} adapter={adapter} />;
};

const AzureCommunicationOutboundCallScreen = (props: AzureCommunicationCallScreenProps): JSX.Element => {
  const { afterCreate, targetCallees: targetCallees, userId, ...adapterArgs } = props;

  if (!('communicationUserId' in userId)) {
    throw new Error('A MicrosoftTeamsUserIdentifier must be provided for Teams Identity Call.');
  }

  const callAdapterOptions: AzureCommunicationCallAdapterOptions = useMemo(() => {
    return {
      videoBackgroundOptions: {
        videoBackgroundImages,
        onResolveDependency: onResolveVideoEffectDependencyLazy
      },
      callingSounds: {
        callEnded: { url: 'assets/sounds/callEnded.mp3' },
        callRinging: { url: 'assets/sounds/callRinging.mp3' },
        callBusy: { url: 'assets/sounds/callBusy.mp3' }
      },
      reactionResources: {
        likeReaction: {
          url: 'assets/reactions/likeEmoji.png',
          frameCount: 102
        },
        heartReaction: {
          url: 'assets/reactions/heartEmoji.png',
          frameCount: 102
        },
        laughReaction: {
          url: 'assets/reactions/laughEmoji.png',
          frameCount: 102
        },
        applauseReaction: {
          url: 'assets/reactions/clapEmoji.png',
          frameCount: 102
        },
        surprisedReaction: {
          url: 'assets/reactions/surprisedEmoji.png',
          frameCount: 102
        }
      },
      onFetchProfile: async (userId: string, defaultProfile?: Profile): Promise<Profile | undefined> => {
        if (userId === '<28:orgid:Enter your teams app here>') {
          return { displayName: 'Teams app display name' };
        }
        return defaultProfile;
      },
      alternateCallerId: adapterArgs.alternateCallerId
    };
  }, [adapterArgs.alternateCallerId]);

  const adapter = useAzureCommunicationCallAdapter(
    {
      ...adapterArgs,
      userId,
      targetCallees: targetCallees,
      options: callAdapterOptions
    },
    afterCreate
  );

  return <CallCompositeContainer {...props} adapter={adapter} />;
};

// const convertPageStateToString = (state: CallAdapterState): string => {
//   switch (state.page) {
//     case 'accessDeniedTeamsMeeting':
//       return 'error';
//     case 'badRequest':
//       return 'error';
//     case 'leftCall':
//       return 'end call';
//     case 'removedFromCall':
//       return 'end call';
//     default:
//       return `${state.page}`;
//   }
// };

const videoBackgroundImages = [
  {
    key: 'contoso',
    url: 'assets/backgrounds/contoso.png',
    tooltipText: 'Contoso Background'
  },
  {
    key: 'pastel',
    url: 'assets/backgrounds/abstract2.jpg',
    tooltipText: 'Pastel Background'
  },
  {
    key: 'rainbow',
    url: 'assets/backgrounds/abstract3.jpg',
    tooltipText: 'Rainbow Background'
  },
  {
    key: 'office',
    url: 'assets/backgrounds/room1.jpg',
    tooltipText: 'Office Background'
  },
  {
    key: 'plant',
    url: 'assets/backgrounds/room2.jpg',
    tooltipText: 'Plant Background'
  },
  {
    key: 'bedroom',
    url: 'assets/backgrounds/room3.jpg',
    tooltipText: 'Bedroom Background'
  },
  {
    key: 'livingroom',
    url: 'assets/backgrounds/room4.jpg',
    tooltipText: 'Living Room Background'
  }
];
