import {
  createWebMediaSessionBackend,
  installMediaSessionHostBackend,
  observeMediaSessionHostResult,
} from '@flighthq/mediasession/contract';
import type { MediaSessionBackend } from '@flighthq/types/contract';

// Local mutable view for conditional composition; the installed value is the readonly interface.
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export function enableHostWebMediaSession(): void {
  if (_enabled) return;
  _enabled = true;
  const inner = createWebMediaSessionBackend();
  // ★ COMPOSED CONDITIONALLY, not with optional calls. Every MediaSession operation is optional, so
  // wrapping `inner.setMetadata?.(…)` would give this backend a setMetadata that silently does nothing
  // when the inner one has none — the wrapper would then report as implementing an operation it cannot
  // perform, which is the exact masquerade the absence-declared interface removes. Instead the wrapper
  // carries an operation only when the thing it delegates to carries it, so
  // `hasMediaSessionOperation` stays truthful through the host layer.
  const backend: Mutable<MediaSessionBackend> = {};
  if (inner.setActionHandler !== undefined) {
    backend.setActionHandler = (action, handler) => {
      try {
        inner.setActionHandler!(action, handler);
        observeMediaSessionHostResult('setActionHandler', true);
      } catch {
        observeMediaSessionHostResult('setActionHandler', false);
      }
    };
  }
  if (inner.setMetadata !== undefined) {
    backend.setMetadata = (metadata) => {
      try {
        inner.setMetadata!(metadata);
        observeMediaSessionHostResult('setMetadata', true);
      } catch {
        observeMediaSessionHostResult('setMetadata', false);
      }
    };
  }
  if (inner.setPlaybackState !== undefined) {
    backend.setPlaybackState = (state) => {
      try {
        inner.setPlaybackState!(state);
        observeMediaSessionHostResult('setPlaybackState', true);
      } catch {
        observeMediaSessionHostResult('setPlaybackState', false);
      }
    };
  }
  if (inner.setPositionState !== undefined) {
    backend.setPositionState = (state) => {
      try {
        inner.setPositionState!(state);
        observeMediaSessionHostResult('setPositionState', true);
      } catch {
        observeMediaSessionHostResult('setPositionState', false);
      }
    };
  }
  // Teardown delegates so replacing the host layer frees what the inner backend published to the OS.
  if (inner.destroy !== undefined) {
    backend.destroy = () => inner.destroy!();
  }

  installMediaSessionHostBackend(backend);
}

export function resetHostWebMediasessionForTest(): void {
  _enabled = false;
}

let _enabled = false;
