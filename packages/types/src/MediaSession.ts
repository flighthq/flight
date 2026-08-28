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
// ★ EVERY OPERATION IS OPTIONAL, and that is the declaration rather than a convenience. A host declares
// what it cannot do by OMITTING the method — there is no sentinel implementation to fall back on, so an
// absent operation is absent rather than silently answered by a no-op that a caller cannot distinguish
// from a real one. Ask `hasMediaSessionOperation` before assuming an operation exists.
export interface MediaSessionBackend {
  // Publishes the now-playing card, or clears it when metadata is null.
  setMetadata?(metadata: Readonly<MediaSessionMetadata> | null): void;
  // Reports whether media is playing/paused/absent to the OS media UI.
  setPlaybackState?(state: MediaSessionPlaybackState): void;
  // Publishes the scrubber position/duration, or clears it when state is null.
  setPositionState?(state: Readonly<MediaSessionPositionState> | null): void;
  // Registers a handler for an OS transport button, or clears it when handler is null.
  setActionHandler?(
    action: MediaSessionAction,
    handler: ((details: Readonly<MediaSessionActionDetails>) => void) | null,
  ): void;
  // Clears everything this backend published to the OS: the now-playing card, the playback state, the
  // scrubber, and every action handler it registered.
  //
  // ★ `destroy`, not `dispose`, and it is a WHOLE-BACKEND teardown even though the backend holds no
  // object. What it frees is state installed into a host singleton (`navigator.mediaSession`): metadata,
  // playback state and action callbacks that outlive the backend and keep pointing at it. Replacing the
  // backend without this leaves the OS showing a card the replaced implementation published, with
  // transport buttons still calling into it.
  destroy?(): void;
}

// Every operation name on the backend, DERIVED from the interface rather than listed. A hand-written
// roster would be a second source of truth that drifts the moment an operation is added or renamed;
// `keyof` cannot.
export type MediaSessionOperation = keyof MediaSessionBackend;
