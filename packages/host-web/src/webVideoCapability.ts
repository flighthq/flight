import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, VideoCapabilityBackend, EntityConstruction } from '@flighthq/types/contract';

export function createWebVideoCapabilityBackend(): VideoCapabilityBackend & Entity {
  const out = allocateEntity<VideoCapabilityBackend & Entity>();
  initializeWebVideoCapabilityBackend(out);
  return finishEntity(out);
}

export function initializeWebVideoCapabilityBackend(out: EntityConstruction<VideoCapabilityBackend & Entity>): void {
  out.canPlayType = (mimeType): boolean => {
    try {
      const result = document.createElement('video').canPlayType(mimeType);
      return result === 'maybe' || result === 'probably';
    } catch {
      return false;
    }
  };
  out.createVideoElement = () => {
    try {
      return document.createElement('video');
    } catch {
      return null;
    }
  };
}

export const webVideoCapabilityBackend: VideoCapabilityBackend & Entity = createWebVideoCapabilityBackend();
