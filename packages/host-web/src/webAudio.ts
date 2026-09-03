import { createEntity } from '@flighthq/entity/contract';
import type { AudioBackend, Entity } from '@flighthq/types/contract';

export const webAudioBackend: AudioBackend = createEntity<Omit<AudioBackend, keyof Entity>>({
  canPlayType(mimeType: string): boolean {
    return new Audio().canPlayType(mimeType) !== '';
  },
});
