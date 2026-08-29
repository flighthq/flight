import type { VideoCapabilityBackend } from '@flighthq/types/contract';
import {
  hasVideoCapabilityHostBackend,
  installVideoCapabilityHostBackend,
  observeVideoCapabilityHostResult,
} from '@flighthq/video/contract';

export function enableHostWebVideoCapability(): void {
  if (hasVideoCapabilityHostBackend()) return;
  installVideoCapabilityHostBackend(createWebVideoCapabilityBackend());
}

function createWebVideoCapabilityBackend(): VideoCapabilityBackend {
  return {
    canPlayType(mimeType): boolean {
      try {
        const result = document.createElement('video').canPlayType(mimeType);
        observeVideoCapabilityHostResult('canPlayType', true);
        return result === 'maybe' || result === 'probably';
      } catch {
        observeVideoCapabilityHostResult('canPlayType', false);
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
  };
}
