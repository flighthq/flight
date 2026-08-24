import {
  createWebMediaSessionBackend,
  installMediaSessionHostBackend,
  observeMediaSessionHostResult,
} from '@flighthq/mediasession/contract';
import type { MediaSessionBackend } from '@flighthq/types/contract';

export function enableHostWebMediaSession(): void {
  if (_enabled) return;
  _enabled = true;
  const inner = createWebMediaSessionBackend();
  const backend: MediaSessionBackend = {
    setActionHandler(action, handler) {
      try {
        inner.setActionHandler(action, handler);
        observeMediaSessionHostResult('setActionHandler', true);
      } catch {
        observeMediaSessionHostResult('setActionHandler', false);
      }
    },
    setMetadata(metadata) {
      try {
        inner.setMetadata(metadata);
        observeMediaSessionHostResult('setMetadata', true);
      } catch {
        observeMediaSessionHostResult('setMetadata', false);
      }
    },
    setPlaybackState(state) {
      try {
        inner.setPlaybackState(state);
        observeMediaSessionHostResult('setPlaybackState', true);
      } catch {
        observeMediaSessionHostResult('setPlaybackState', false);
      }
    },
    setPositionState(state) {
      try {
        inner.setPositionState(state);
        observeMediaSessionHostResult('setPositionState', true);
      } catch {
        observeMediaSessionHostResult('setPositionState', false);
      }
    },
  };
  installMediaSessionHostBackend(backend);
}

export function resetHostWebMediasessionForTest(): void {
  _enabled = false;
}

let _enabled = false;
