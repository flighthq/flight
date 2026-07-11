import type {
  MediaSessionAction,
  MediaSessionActionDetails,
  MediaSessionBackend,
  MediaSessionMetadata,
  MediaSessionPlaybackState,
  MediaSessionPositionState,
} from '@flighthq/types';

// Clears the handler for a transport action; the OS drops the corresponding button.
export function clearMediaSessionActionHandler(action: MediaSessionAction): void {
  getMediaSessionBackend().setActionHandler(action, null);
}

// Clears the now-playing card from the OS media UI.
export function clearMediaSessionMetadata(): void {
  getMediaSessionBackend().setMetadata(null);
}

// Clears the scrubber position/duration the OS shows.
export function clearMediaSessionPositionState(): void {
  getMediaSessionBackend().setPositionState(null);
}

// Builds the default web backend over navigator.mediaSession. Every method is a no-op when the API
// (or a specific capability such as setPositionState / MediaMetadata) is absent — jsdom, older
// browsers, non-secure contexts — rather than throwing.
export function createWebMediaSessionBackend(): MediaSessionBackend {
  return {
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
  };
}

// The active media-session backend, or a lazily-created web default. There is always a backend.
export function getMediaSessionBackend(): MediaSessionBackend {
  if (_backend === null) _backend = createWebMediaSessionBackend();
  return _backend;
}

// Registers a handler the OS invokes when the user presses the corresponding transport button
// (play/pause/next/seek/…). Pass null via clearMediaSessionActionHandler to remove it.
export function setMediaSessionActionHandler(
  action: MediaSessionAction,
  handler: (details: Readonly<MediaSessionActionDetails>) => void,
): void {
  getMediaSessionBackend().setActionHandler(action, handler);
}

// Installs a native host media-session backend; pass null to fall back to the web default.
export function setMediaSessionBackend(backend: MediaSessionBackend | null): void {
  _backend = backend;
}

// Publishes the now-playing card (title/artist/album/artwork) to the OS media UI.
export function setMediaSessionMetadata(metadata: Readonly<MediaSessionMetadata>): void {
  getMediaSessionBackend().setMetadata(metadata);
}

// Reports whether media is playing/paused/absent so the OS shows the right play/pause affordance.
export function setMediaSessionPlaybackState(state: MediaSessionPlaybackState): void {
  getMediaSessionBackend().setPlaybackState(state);
}

// Publishes the scrubber position/duration/playbackRate so the OS can render an accurate seek bar.
export function setMediaSessionPositionState(state: Readonly<MediaSessionPositionState>): void {
  getMediaSessionBackend().setPositionState(state);
}

let _backend: MediaSessionBackend | null = null;

function getWebMediaSession(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null;
  return navigator.mediaSession;
}
