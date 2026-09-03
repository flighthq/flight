import { createEntity } from '@flighthq/entity/contract';
import type { Entity, VideoCapabilityBackend } from '@flighthq/types/contract';

export function createWebVideoCapabilityBackend(): VideoCapabilityBackend & Entity {
  return createEntity({
    canPlayType(mimeType): boolean {
      try {
        const result = document.createElement('video').canPlayType(mimeType);
        return result === 'maybe' || result === 'probably';
      } catch {
        return false;
      }
    },
    createVideoElement() {
      try {
        return document.createElement('video');
      } catch {
        return null;
      }
    },
  } satisfies VideoCapabilityBackend);
}

export const webVideoCapabilityBackend: VideoCapabilityBackend & Entity = createWebVideoCapabilityBackend();
