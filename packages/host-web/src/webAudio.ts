import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostAudioProvider, EntityConstruction } from '@flighthq/types/contract';

export function initializeWebAudioBackend(out: EntityConstruction<HostAudioProvider>): void {
  out.canPlayType = (mimeType: string): boolean => {
    return new Audio().canPlayType(mimeType) !== '';
  };
}

export const webHostAudio = (() => {
  const out = allocateEntity<HostAudioProvider>();
  initializeWebAudioBackend(out);
  return finishEntity(out);
})();
