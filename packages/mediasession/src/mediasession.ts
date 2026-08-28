import type {
  BackendExplanation,
  BackendOperationExplanation,
  MediaSessionAction,
  MediaSessionActionDetails,
  MediaSessionBackend,
  MediaSessionMetadata,
  MediaSessionOperation,
  MediaSessionPlaybackState,
  MediaSessionPositionState,
} from '@flighthq/types/contract';

export function clearMediaSessionActionHandler(action: MediaSessionAction): void {
  getMediaSessionBackend().setActionHandler?.(action, null);
}

export function clearMediaSessionMetadata(): void {
  getMediaSessionBackend().setMetadata?.(null);
}

export function clearMediaSessionPositionState(): void {
  getMediaSessionBackend().setPositionState?.(null);
}

// Builds the default web backend over navigator.mediaSession. Every method is a no-op when the API
// (or a specific capability such as setPositionState / MediaMetadata) is absent — jsdom, older
// browsers, non-secure contexts — rather than throwing.
export function createWebMediaSessionBackend(): MediaSessionBackend {
  // Which actions this instance registered, so destroy clears exactly those and not a handler some other
  // code installed. Per-instance rather than module state: two backends must not clear each other's work.
  const registered = new Set<MediaSessionAction>();
  return {
    // Clears everything this instance published to navigator.mediaSession. Idempotent — the action set is
    // emptied as it is walked, so a second destroy finds nothing to clear.
    destroy() {
      const session = getWebMediaSession();
      if (session === null) return;
      for (const action of registered) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Unsupported action — it was never registered, so there is nothing to clear.
        }
      }
      registered.clear();
      session.metadata = null;
      session.playbackState = 'none';
      if (typeof session.setPositionState === 'function') session.setPositionState(undefined);
    },
    setActionHandler(action, handler) {
      const session = getWebMediaSession();
      if (session === null) return;
      try {
        // Some browsers throw for an action they do not support; treat that as a no-op.
        session.setActionHandler(action, handler ? (details) => handler(details as MediaSessionActionDetails) : null);
        if (handler === null) registered.delete(action);
        else registered.add(action);
      } catch {
        // Unsupported action — leave it unregistered.
      }
    },
    setMetadata(metadata) {
      const session = getWebMediaSession();
      if (session === null) return;
      if (metadata === null) {
        session.metadata = null;
        return;
      }
      if (typeof MediaMetadata === 'undefined') return;
      session.metadata = new MediaMetadata({
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        artwork: [...metadata.artwork],
      });
    },
    setPlaybackState(state) {
      const session = getWebMediaSession();
      if (session === null) return;
      session.playbackState = state;
    },
    setPositionState(state) {
      const session = getWebMediaSession();
      if (session === null || typeof session.setPositionState !== 'function') return;
      // A null position clears the OS scrubber; the web API spells "clear" as an omitted argument.
      session.setPositionState(state ?? undefined);
    },
  };
}

// Frees what the installed backend published to the OS and clears the slot. Safe with nothing installed
// and safe to call twice — the second call finds an empty slot, which is what makes teardown exactly-once
// without a destroyed flag that could drift from the thing it describes.
export function destroyMediaSessionBackend(): void {
  const backend = _custom ?? _host;
  _custom = null;
  _host = null;
  backend?.destroy?.();
}

export function explainMediaSessionBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

// Which layer implements `operation`, and whether anything real does. The sentinel is not consulted and
// implements nothing, so an unimplemented operation reports honestly rather than as a silent no-op.
export function explainMediaSessionOperation(operation: MediaSessionOperation): BackendOperationExplanation {
  if (_custom !== null && typeof _custom[operation] === 'function') {
    return { implemented: true, layer: 'custom', operation };
  }
  if (_host !== null && typeof _host[operation] === 'function') {
    return { implemented: true, layer: 'host', operation };
  }
  return { implemented: false, layer: 'sentinel', operation };
}

export function getMediaSessionBackend(): MediaSessionBackend {
  return _custom ?? _host ?? _sentinel;
}

// Whether a real backend implements `operation`. Every OS transport control is optional, so a caller that
// shows a scrubber or a next-track button should ask before offering it.
export function hasMediaSessionOperation(operation: MediaSessionOperation): boolean {
  return explainMediaSessionOperation(operation).implemented;
}

export function installMediaSessionHostBackend(backend: MediaSessionBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function observeMediaSessionHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

export function resetMediaSessionBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

export function setMediaSessionActionHandler(
  action: MediaSessionAction,
  handler: (details: Readonly<MediaSessionActionDetails>) => void,
): void {
  getMediaSessionBackend().setActionHandler?.(action, handler);
}

// Installs the backend, DESTROYING the outgoing one first so replacement and removal cannot leave the OS
// showing a card the replaced implementation published, with transport buttons still calling into it.
// Installing the backend already present is a no-op rather than a destroy-then-reinstall of live state.
export function setMediaSessionBackend(backend: MediaSessionBackend | null): void {
  if (_custom === backend) return;
  _custom?.destroy?.();
  _custom = backend;
}

export function setMediaSessionMetadata(metadata: Readonly<MediaSessionMetadata>): void {
  getMediaSessionBackend().setMetadata?.(metadata);
}

export function setMediaSessionPlaybackState(state: MediaSessionPlaybackState): void {
  getMediaSessionBackend().setPlaybackState?.(state);
}

export function setMediaSessionPositionState(state: Readonly<MediaSessionPositionState>): void {
  getMediaSessionBackend().setPositionState?.(state);
}

// ★ EMPTY ON PURPOSE. A sentinel that implemented these four would answer every call with a no-op that a
// caller cannot tell from a real one — the invisible lie this work exists to remove. With the operations
// declared optional, the empty object is the honest fall-through: calls no-op via `?.` and
// `hasMediaSessionOperation` reports false, so the absence is observable rather than disguised.
const _sentinel: MediaSessionBackend = {};

let _custom: MediaSessionBackend | null = null;
let _host: MediaSessionBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;

function getWebMediaSession(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null;
  return navigator.mediaSession;
}
