import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, VideoCapabilityBackend } from '@flighthq/types/contract';

export function createWebVideoCapabilityBackend(): VideoCapabilityBackend & Entity {
  const out = allocateEntity<VideoCapabilityBackend & Entity>();
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
  return finishEntity(out);
}

export const webVideoCapabilityBackend: VideoCapabilityBackend & Entity = createWebVideoCapabilityBackend();
