import type { HostAudioCapabilities } from '@flighthq/types/contract';

import { webHostAudio } from './webAudio.ts';
import { webHostAudioDevice } from './webAudioDevice.ts';
import { webHostAudioMixer } from './webAudioMixer.ts';

export const webHostAudioGroup = {
  codec: webHostAudio,
  device: webHostAudioDevice,
  mixer: webHostAudioMixer,
} satisfies HostAudioCapabilities;
