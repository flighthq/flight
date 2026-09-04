import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  EntityConstruction,
  HasMediaSession,
  HasMediaSessionAction,
  MediaSessionAction,
  MediaSessionActionSignal,
  MediaSessionClearMetadataOutcome,
  MediaSessionClearPositionStateOutcome,
  MediaSessionMetadata,
  MediaSessionPlaybackState,
  MediaSessionPositionState,
  MediaSessionSetMetadataOutcome,
  MediaSessionSetPlaybackStateOutcome,
  MediaSessionSetPositionStateOutcome,
} from '@flighthq/types/contract';

// Attaches exactly the action named by `signal`. A null provider subscription is a truthful runtime
// refusal and leaves the entity detached. Reattaching first releases the prior exact origin.
export function attachMediaSessionAction(host: HasMediaSessionAction, signal: MediaSessionActionSignal): boolean {
  detachMediaSessionAction(signal);
  const unsubscribe = host.media.sessionAction.subscribe(signal.action, (details) => {
    emitSignal(signal.onAction, details);
  });
  if (unsubscribe === null) return false;
  _actionSubscriptions.set(signal, unsubscribe);
  return true;
}

export function clearMediaSessionMetadata(host: HasMediaSession): MediaSessionClearMetadataOutcome {
  return host.media.session.clearMetadata();
}

export function clearMediaSessionPositionState(host: HasMediaSession): MediaSessionClearPositionStateOutcome {
  return host.media.session.clearPositionState();
}

export function createMediaSessionActionSignal(action: MediaSessionAction): MediaSessionActionSignal {
  const out = allocateEntity<MediaSessionActionSignal>();
  out.action = action;
  out.onAction = createSignal();
  return finishEntity(out);
}

// Provider lifetime is separate from per-action subscription lifetime. Every distinct provider is
// destroyed once; aliasing the two Host slots cannot double-release it, and one throwing provider does
// not prevent the other distinct provider from being attempted.
export function destroyMediaSession(host: HasMediaSession & HasMediaSessionAction): void {
  const providers = new Set([host.media.session, host.media.sessionAction]);
  let firstError: unknown;
  let hasError = false;
  for (const provider of providers) {
    try {
      assertSyncVoid(provider.destroy());
    } catch (error) {
      if (!hasError) firstError = error;
      hasError = true;
    }
  }
  if (hasError) throw firstError;
}

// Keeps the subscription registered when its unsubscribe throws so a later detach can retry the exact
// provider/session/action/token origin. The map entry is removed only after successful release.
export function detachMediaSessionAction(signal: MediaSessionActionSignal): void {
  const unsubscribe = _actionSubscriptions.get(signal);
  if (unsubscribe === undefined) return;
  unsubscribe();
  _actionSubscriptions.delete(signal);
}

export function disposeMediaSessionActionSignal(signal: MediaSessionActionSignal): void {
  try {
    detachMediaSessionAction(signal);
  } finally {
    clearSignal(signal.onAction);
  }
}

export function setMediaSessionMetadata(
  host: HasMediaSession,
  metadata: Readonly<MediaSessionMetadata>,
): MediaSessionSetMetadataOutcome {
  return host.media.session.setMetadata(metadata);
}

export function setMediaSessionPlaybackState(
  host: HasMediaSession,
  state: MediaSessionPlaybackState,
): MediaSessionSetPlaybackStateOutcome {
  // TypeScript callers cannot construct this misuse, but untyped JavaScript can. It is programmer error,
  // not a platform outcome, and is rejected before the provider can observe it.
  if (state !== 'none' && state !== 'paused' && state !== 'playing') {
    throw new TypeError(`Invalid media-session playback state: ${String(state)}`);
  }
  return host.media.session.setPlaybackState(state);
}

export function setMediaSessionPositionState(
  host: HasMediaSession,
  state: Readonly<MediaSessionPositionState>,
): MediaSessionSetPositionStateOutcome {
  // The W3C algorithm classifies these values locally. Invalid caller data wins over runtime API
  // availability because the provider is never invoked for a request that cannot be valid anywhere.
  if (!Number.isFinite(state.duration) || state.duration <= 0) return INVALID_DURATION;
  if (!Number.isFinite(state.position) || state.position < 0 || state.position > state.duration) {
    return INVALID_POSITION;
  }
  if (!Number.isFinite(state.playbackRate) || state.playbackRate === 0) return INVALID_PLAYBACK_RATE;
  return host.media.session.setPositionState(state);
}

const INVALID_DURATION = { reason: 'invalid-duration' } as const;
const INVALID_PLAYBACK_RATE = { reason: 'invalid-playback-rate' } as const;
const INVALID_POSITION = { reason: 'invalid-position' } as const;
const _actionSubscriptions = new WeakMap<MediaSessionActionSignal, () => void>();

type IsAny<T> = 0 extends 1 & T ? true : false;
function assertSyncVoid<T>(value: T & (IsAny<T> extends true ? never : T extends void ? unknown : never)): void {
  void value;
}
