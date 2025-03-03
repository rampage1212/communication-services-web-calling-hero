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
  CallAdapterState,
  CommonCallAdapter,
  onResolveDeepNoiseSuppressionDependencyLazy,
  onResolveVideoEffectDependencyLazy,
  TeamsCallAdapter,
  toFlatCommunicationIdentifier,
  useAzureCommunicationCallAdapter,
  useTeamsCallAdapter
} from '@azure/communication-react';
import type { Profile, StartCallIdentifier, TeamsAdapterOptions } from '@azure/communication-react';
import React, { useCallback, useMemo, useRef } from 'react';
import { createAutoRefreshingCredential } from '../utils/credential';
import { WEB_APP_TITLE } from '../utils/AppUtils';
import { CallCompositeContainer } from './CallCompositeContainer';

const initializeSpeechTranslation = (
  speechKey: string,
  speechRegion: string,
  sourceLanguage: string,
  targetLanguage: string
) => {
  const speechConfig = SpeechSDK.SpeechTranslationConfig.fromSubscription(speechKey, speechRegion);
  speechConfig.speechRecognitionLanguage = sourceLanguage; // Source language (e.g., "en-US")
  speechConfig.addTargetLanguage(targetLanguage); // Target language (e.g., "ja-JP")

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = new SpeechSDK.TranslationRecognizer(speechConfig, audioConfig);

  recognizer.recognizing = (s, e) => {
    console.log(`Translating: ${e.result.text}`);
  };

  // recognizer.recognized = (s, e) => {
  //   const translation = e.result.translations.get(targetLanguage); // Get translated text
  //   console.log(`Translated: ${translation}`);
  //   // Synthesize the translated text into speech
  //   const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig);
  //   synthesizer.speakTextAsync('Hey hey, say like this, Amazing!');
  // };

  recognizer.recognized = (s, e) => {
    if (e.result.reason === SpeechSDK.ResultReason.TranslatedSpeech) {
      const languageCode = targetLanguage.split('-')[0]; // Extract base language code
      const translation = e.result.translations.get(languageCode);

      if (!translation) {
        console.error(`No translation found for ${languageCode}`);
        return;
      }

      console.log(`Translated: ${translation}`);

      // Separate speech config for synthesis
      const synthConfig = SpeechSDK.SpeechConfig.fromSubscription(speechKey, speechRegion);
      synthConfig.speechSynthesisLanguage = targetLanguage; // Now use full locale

      const synthesizer = new SpeechSDK.SpeechSynthesizer(synthConfig);
      synthesizer.speakTextAsync(translation, (result) => {
        if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
          console.log('Speech synthesis succeeded');
        } else {
          console.error('Speech synthesis failed:', result.errorDetails);
        }
        synthesizer.close();
      });
    }
  };

  recognizer.startContinuousRecognitionAsync();
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
  const callIdRef = useRef<string>();

  const subscribeAdapterEvents = useCallback((adapter: CommonCallAdapter) => {
    adapter.on('error', (e) => {
      // Error is already acted upon by the Call composite, but the surrounding application could
      // add top-level error handling logic here (e.g. reporting telemetry).
      console.log('Adapter error event:', e);
    });

    adapter.onStateChange((state: CallAdapterState) => {
      console.log('Call State:', state.page);
      const pageTitle = convertPageStateToString(state);
      document.title = `${pageTitle} - ${WEB_APP_TITLE}`;

      if (state?.call?.id && callIdRef.current !== state?.call?.id) {
        callIdRef.current = state?.call?.id;
        console.log(`Call Id: ${callIdRef.current}`);
      }
      // Start translation when a participant is speaking
      if (
        state.page === 'call' &&
        state?.call?.remoteParticipants &&
        Object.values(state.call.remoteParticipants).length > 0
      ) {
        console.log('Participants:', Object.values(state.call.remoteParticipants));
        Object.values(state.call.remoteParticipants).forEach((participantState) => {
          if (participantState.isSpeaking) {
            console.log('isSpeaking is true');

            const speechKey = 'D3If46lhxGGi9J8TveBGhzDmU7nU2VTK860icmwPVvMvgx4JY9ABJQQJ99BBACYeBjFXJ3w3AAAYACOGefwk';
            const speechRegion = 'eastus'; // Replace with your Speech Service region
            const sourceLanguage = 'en-US'; // Source language (English)
            const targetLanguage = 'ja-JP'; // Target language (Japanese)

            try {
              initializeSpeechTranslation(speechKey, speechRegion, sourceLanguage, targetLanguage);
            } catch (error) {
              console.error('Translation initialization failed:', error);
            }
          }
        });
      }
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
        likeReaction: { url: 'assets/reactions/likeEmoji.png', frameCount: 102 },
        heartReaction: { url: 'assets/reactions/heartEmoji.png', frameCount: 102 },
        laughReaction: { url: 'assets/reactions/laughEmoji.png', frameCount: 102 },
        applauseReaction: { url: 'assets/reactions/clapEmoji.png', frameCount: 102 },
        surprisedReaction: { url: 'assets/reactions/surprisedEmoji.png', frameCount: 102 }
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
        likeReaction: { url: 'assets/reactions/likeEmoji.png', frameCount: 102 },
        heartReaction: { url: 'assets/reactions/heartEmoji.png', frameCount: 102 },
        laughReaction: { url: 'assets/reactions/laughEmoji.png', frameCount: 102 },
        applauseReaction: { url: 'assets/reactions/clapEmoji.png', frameCount: 102 },
        surprisedReaction: { url: 'assets/reactions/surprisedEmoji.png', frameCount: 102 }
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
  // useEffect(() => {
  //   // Start capturing audio for translation
  //   const speechKey = 'D3If46lhxGGi9J8TveBGhzDmU7nU2VTK860icmwPVvMvgx4JY9ABJQQJ99BBACYeBjFXJ3w3AAAYACOGefwk'; // Replace with your Speech Service key
  //   const speechRegion = 'eastus'; // Replace with your Speech Service region
  //   const sourceLanguage = 'en-US'; // Source language (English)
  //   const targetLanguage = 'ja-JP'; // Target language (Japanese)

  //   initializeSpeechTranslation(speechKey, speechRegion, sourceLanguage, targetLanguage);
  // }, []);

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
        likeReaction: { url: 'assets/reactions/likeEmoji.png', frameCount: 102 },
        heartReaction: { url: 'assets/reactions/heartEmoji.png', frameCount: 102 },
        laughReaction: { url: 'assets/reactions/laughEmoji.png', frameCount: 102 },
        applauseReaction: { url: 'assets/reactions/clapEmoji.png', frameCount: 102 },
        surprisedReaction: { url: 'assets/reactions/surprisedEmoji.png', frameCount: 102 }
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

const convertPageStateToString = (state: CallAdapterState): string => {
  switch (state.page) {
    case 'accessDeniedTeamsMeeting':
      return 'error';
    case 'badRequest':
      return 'error';
    case 'leftCall':
      return 'end call';
    case 'removedFromCall':
      return 'end call';
    default:
      return `${state.page}`;
  }
};

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
