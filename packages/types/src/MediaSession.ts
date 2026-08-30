import type { Entity } from './Entity';
import type { Signal } from './Signal';

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

// Reasons a media-session command can fail without throwing. Public command functions narrow this
// vocabulary to only the reasons their exact operation can reach.
export type MediaSessionOperationBlockReason =
  | 'invalid-artwork-source'
  | 'invalid-duration'
  | 'invalid-playback-rate'
  | 'invalid-position'
  | 'media-metadata-unavailable'
  | 'media-session-unavailable'
  | 'operation-failed'
  | 'position-state-unavailable';

export interface MediaSessionOperationOutcome<
  BlockReason extends MediaSessionOperationBlockReason = MediaSessionOperationBlockReason,
> {
  readonly reason: 'ok' | BlockReason;
}

export type MediaSessionSetMetadataOutcome = MediaSessionOperationOutcome<
  'media-session-unavailable' | 'media-metadata-unavailable' | 'invalid-artwork-source' | 'operation-failed'
>;

export type MediaSessionClearMetadataOutcome = MediaSessionOperationOutcome<
  'media-session-unavailable' | 'operation-failed'
>;

export type MediaSessionSetPlaybackStateOutcome = MediaSessionOperationOutcome<
  'media-session-unavailable' | 'operation-failed'
>;

export type MediaSessionSetPositionStateOutcome = MediaSessionOperationOutcome<
  | 'media-session-unavailable'
  | 'position-state-unavailable'
  | 'invalid-duration'
  | 'invalid-position'
  | 'invalid-playback-rate'
  | 'operation-failed'
>;

export type MediaSessionClearPositionStateOutcome = MediaSessionOperationOutcome<
  'media-session-unavailable' | 'position-state-unavailable' | 'operation-failed'
>;

// Web-only today. Slot absence on Host.media is capability absence; these method results describe
// runtime availability and operation failure after a host has supplied the command capability.
export interface MediaSessionBackend extends Entity {
  clearMetadata(): MediaSessionClearMetadataOutcome;
  clearPositionState(): MediaSessionClearPositionStateOutcome;
  // Releases only the metadata/playback/position lanes this exact provider still owns. A failed
  // release remains retryable; action subscriptions have their own provider lifetime below.
  destroy(): void;
  setMetadata(metadata: Readonly<MediaSessionMetadata>): MediaSessionSetMetadataOutcome;
  setPlaybackState(state: MediaSessionPlaybackState): MediaSessionSetPlaybackStateOutcome;
  setPositionState(state: Readonly<MediaSessionPositionState>): MediaSessionSetPositionStateOutcome;
}

// Event capability split from MediaSessionBackend even though both are Web-only: commands and
// subscriptions have incompatible shapes and independent teardown obligations.
export interface MediaSessionActionBackend extends Entity {
  // Releases every surviving native action registration owned by this provider. Individual
  // subscriptions are still released through their exact returned unsubscribe.
  destroy(): void;
  // Registers only the requested action. Returns null when the browser session or action is unavailable;
  // otherwise returns the exact, retryable unsubscribe for this provider/session/action/token origin.
  subscribe(
    action: MediaSessionAction,
    listener: (details: Readonly<MediaSessionActionDetails>) => void,
  ): (() => void) | null;
}

// One Entity per requested OS action. Blanket action registration is intentionally impossible: doing
// so would advertise transport controls the application has not attached a handler to.
export interface MediaSessionActionSignal extends Entity {
  readonly action: MediaSessionAction;
  readonly onAction: Signal<(details: Readonly<MediaSessionActionDetails>) => void>;
}
