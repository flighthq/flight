// A single now-playing artwork image. `src` is the image URL; `sizes` (e.g. '96x96 128x128') and
// `type` (MIME, e.g. 'image/png') are optional hints the OS uses to pick the best resolution.
// Mirrors the web MediaImage passed to MediaMetadata.
export interface MediaSessionArtwork {
  src: string;
  sizes?: string;
  type?: string;
}

// The now-playing card the OS shows in its media UI (lock screen, notification shade, smart-watch).
// Passed to setMediaSessionMetadata; mirrors the web MediaMetadata fields.
export interface MediaSessionMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: readonly MediaSessionArtwork[];
}

// The standard W3C transport actions the OS surfaces as buttons / hardware media keys. These relay
// verbatim to navigator.mediaSession.setActionHandler, so the values keep the web API's source form.
export type MediaSessionAction =
  | 'play'
  | 'pause'
  | 'stop'
  | 'seekbackward'
  | 'seekforward'
  | 'seekto'
  | 'previoustrack'
  | 'nexttrack'
  | 'skipad';

// The payload the OS passes to a transport action handler. Mirrors the DOM MediaSessionActionDetails:
// `seekTime` is the absolute target for 'seekto'; `seekOffset` the relative amount for seek
// backward/forward; `fastSeek` requests a fast (imprecise) 'seekto'. All optional per action.
export interface MediaSessionActionDetails {
  action: MediaSessionAction;
  seekTime?: number;
  seekOffset?: number;
  fastSeek?: boolean;
}

// The OS's view of playback: 'none' (no active session), 'paused', or 'playing'. Drives whether the
// media UI shows a play or pause affordance.
export type MediaSessionPlaybackState = 'none' | 'paused' | 'playing';

// The scrubber state: total `duration` (seconds), current `position` (seconds), and `playbackRate`
// (1 = normal). Passed to setMediaSessionPositionState so the OS can render an accurate seek bar.
export interface MediaSessionPositionState {
  duration: number;
  playbackRate: number;
  position: number;
}

// OS media-session seam. Free functions in @flighthq/mediasession delegate to the active
// MediaSessionBackend (web default over navigator.mediaSession, or a native host's). Every method is
// a no-op sentinel when the host lacks the capability rather than throwing — publishing now-playing
// state is an expected-to-be-absent surface, not a programmer error.
export interface MediaSessionBackend {
  // Publishes the now-playing card, or clears it when metadata is null.
  setMetadata(metadata: Readonly<MediaSessionMetadata> | null): void;
  // Reports whether media is playing/paused/absent to the OS media UI.
  setPlaybackState(state: MediaSessionPlaybackState): void;
  // Publishes the scrubber position/duration, or clears it when state is null.
  setPositionState(state: Readonly<MediaSessionPositionState> | null): void;
  // Registers a handler for an OS transport button, or clears it when handler is null.
  setActionHandler(
    action: MediaSessionAction,
    handler: ((details: Readonly<MediaSessionActionDetails>) => void) | null,
  ): void;
}
