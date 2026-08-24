import type {
  BackendExplanation,
  MediaSessionAction,
  MediaSessionActionDetails,
  MediaSessionBackend,
  MediaSessionMetadata,
  MediaSessionPlaybackState,
  MediaSessionPositionState,
} from '@flighthq/types/contract';

export function clearMediaSessionActionHandler(action: MediaSessionAction): void {
  getMediaSessionBackend().setActionHandler(action, null);
}

export function clearMediaSessionMetadata(): void {
  getMediaSessionBackend().setMetadata(null);
}

export function clearMediaSessionPositionState(): void {
  getMediaSessionBackend().setPositionState(null);
}

// Builds the default web backend over navigator.mediaSession. Every method is a no-op when the API
// (or a specific capability such as setPositionState / MediaMetadata) is absent — jsdom, older
// browsers, non-secure contexts — rather than throwing.
export function createWebMediaSessionBackend(): MediaSessionBackend {
  return {
    setActionHandler(action, handler) {
      const session = getWebMediaSession();
      if (session === null) return;
      try {
        // Some browsers throw for an action they do not support; treat that as a no-op.
        session.setActionHandler(action, handler ? (details) => handler(details as MediaSessionActionDetails) : null);
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

export function getMediaSessionBackend(): MediaSessionBackend {
  return _custom ?? _host ?? _sentinel;
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
  getMediaSessionBackend().setActionHandler(action, handler);
}

export function setMediaSessionBackend(backend: MediaSessionBackend | null): void {
  _custom = backend;
}

export function setMediaSessionMetadata(metadata: Readonly<MediaSessionMetadata>): void {
  getMediaSessionBackend().setMetadata(metadata);
}

export function setMediaSessionPlaybackState(state: MediaSessionPlaybackState): void {
  getMediaSessionBackend().setPlaybackState(state);
}

export function setMediaSessionPositionState(state: Readonly<MediaSessionPositionState>): void {
  getMediaSessionBackend().setPositionState(state);
}

const _sentinel: MediaSessionBackend = {
  setActionHandler(_action, _handler) {},
  setMetadata(_metadata) {},
  setPlaybackState(_state) {},
  setPositionState(_state) {},
};

let _custom: MediaSessionBackend | null = null;
let _host: MediaSessionBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;

function getWebMediaSession(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null;
  return navigator.mediaSession;
}
