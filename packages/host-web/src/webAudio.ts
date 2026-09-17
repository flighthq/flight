import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostAudioCodecCapability, EntityConstruction } from '@flighthq/types/contract';

export function initializeWebAudioBackend(out: EntityConstruction<HostAudioCodecCapability>): void {
  out.canPlayType = (mimeType: string): boolean => {
    return new Audio().canPlayType(mimeType) !== '';
  };
}

export const webHostAudio = (() => {
  const out = allocateEntity<HostAudioCodecCapability>();
  initializeWebAudioBackend(out);
  return finishEntity(out);
})();
