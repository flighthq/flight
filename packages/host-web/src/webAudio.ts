import type { HostAudioCodecCapability } from '@flighthq/types/contract';

export function initializeWebAudioBackend(out: HostAudioCodecCapability): void {
  out.canPlayType = (mimeType: string): boolean => {
    return new Audio().canPlayType(mimeType) !== '';
  };
}

export const webHostAudio = (() => {
  const out = {} as HostAudioCodecCapability;
  initializeWebAudioBackend(out);
  return out;
})();
