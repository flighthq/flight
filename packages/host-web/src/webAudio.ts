import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { AudioBackend, EntityConstruction } from '@flighthq/types/contract';

export function initializeWebAudioBackend(out: EntityConstruction<AudioBackend>): void {
  out.canPlayType = (mimeType: string): boolean => {
    return new Audio().canPlayType(mimeType) !== '';
  };
}

export const webAudioBackend = (() => {
  const out = allocateEntity<AudioBackend>();
  initializeWebAudioBackend(out);
  return finishEntity(out);
})();
