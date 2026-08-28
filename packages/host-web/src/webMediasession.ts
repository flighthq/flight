import {
  createWebMediaSessionBackend,
  hasMediaSessionHostBackend,
  installMediaSessionHostBackend,
  observeMediaSessionHostResult,
  resetMediaSessionBackendForTest,
} from '@flighthq/mediasession/contract';
import type { MediaSessionBackend } from '@flighthq/types/contract';

// Local mutable view for conditional composition; the installed value is the readonly interface.
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// ★ THE GUARD ASKS RATHER THAN REMEMBERS. See `enableHostWebPower`: a host-local `_enabled` boolean is a
// second copy of a fact `@flighthq/mediasession` owns, nothing reset it, and once the capability cleared
// its host slot the two disagreed permanently — slot empty, this function certain it had installed, and
// the capability pinned to its sentinel for the life of the process.
export function enableHostWebMediaSession(): void {
  if (hasMediaSessionHostBackend()) return;
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

// The host holds no enable state of its own any more, so "un-enable" means clearing the capability slot
// this installed into. Delegates rather than reaching past the owner: the slot belongs to
// `@flighthq/mediasession`, and this is its own published test seam.
export function resetHostWebMediasessionForTest(): void {
  resetMediaSessionBackendForTest();
}
