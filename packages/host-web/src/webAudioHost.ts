import type { HostAudioCapabilities } from '@flighthq/types/contract';

import { webHostAudio } from './webAudio';
import { webHostAudioDevice } from './webAudioDevice';
import { webHostAudioMixer } from './webAudioMixer';

export const webHostAudioGroup = {
  codec: webHostAudio,
  device: webHostAudioDevice,
  mixer: webHostAudioMixer,
} satisfies HostAudioCapabilities;
