import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { AudioBackend, Entity } from '@flighthq/types/contract';

  export const webAudioBackend = (() => {
    const out = allocateEntity<AudioBackend>();
    out.canPlayType = (mimeType: string): boolean => {
    return new Audio().canPlayType(mimeType) !== '';
  };
    return finishEntity(out);
  })();
