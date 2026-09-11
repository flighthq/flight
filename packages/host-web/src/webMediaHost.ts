import type { HostMediaCapabilities } from '@flighthq/types/contract';

import { webHostAudio } from './webAudio';
import { webHostAudioDevice } from './webAudioDevice';
import { webHostMediaSessionAction, webHostMediaSession } from './webMediasession';
import { webHostVideo } from './webVideoCapability';

export const webHostMedia = {
  audioCodec: webHostAudio,
  audioDevice: webHostAudioDevice,
  session: webHostMediaSession,
  sessionAction: webHostMediaSessionAction,
  video: webHostVideo,
} satisfies HostMediaCapabilities;
