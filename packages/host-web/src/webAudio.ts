import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostAudioCapability, EntityConstruction } from '@flighthq/types/contract';

export function initializeWebAudioBackend(out: EntityConstruction<HostAudioCapability>): void {
  out.canPlayType = (mimeType: string): boolean => {
    return new Audio().canPlayType(mimeType) !== '';
  };
}

export const webHostAudio = (() => {
  const out = allocateEntity<HostAudioCapability>();
  initializeWebAudioBackend(out);
  return finishEntity(out);
})();
