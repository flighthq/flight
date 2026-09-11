import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, HostVideoProvider, EntityConstruction } from '@flighthq/types/contract';

export function createWebVideoCapabilityBackend(): HostVideoProvider & Entity {
  const out = allocateEntity<HostVideoProvider & Entity>();
  initializeWebVideoCapabilityBackend(out);
  return finishEntity(out);
}

export function initializeWebVideoCapabilityBackend(out: EntityConstruction<HostVideoProvider & Entity>): void {
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

export const webHostVideo: HostVideoProvider & Entity = createWebVideoCapabilityBackend();
