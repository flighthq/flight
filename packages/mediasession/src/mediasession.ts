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
  const owner = {};
  const publications = new Map<MediaSession, WebMediaSessionPublication>();
  return {
    destroy() {
      for (const [session, publication] of publications) {
        const ownership = _webMediaSessionOwnership.get(session);
        if (ownership === undefined) {
          publications.delete(session);
          continue;
        }

        for (const action of publication.actions) {
          if (ownership.actions.get(action) !== owner) {
            publication.actions.delete(action);
            continue;
          }
          try {
            assertSyncVoid(session.setActionHandler(action, null));
            if (ownership.actions.get(action) === owner) ownership.actions.delete(action);
            publication.actions.delete(action);
          } catch {
            // Keep failed releases owned so a later destroy can retry them.
          }
        }

        if (publication.metadata !== null) {
          const ownedMetadata = ownership.metadata;
          if (ownedMetadata?.owner !== owner) {
            publication.metadata = null;
          } else if (ownedMetadata.value !== publication.metadata || session.metadata !== ownedMetadata.value) {
            ownership.metadata = null;
            publication.metadata = null;
          } else {
            try {
              session.metadata = null;
              if (ownership.metadata?.owner === owner) ownership.metadata = null;
              publication.metadata = null;
            } catch {
              // Keep failed releases owned so a later destroy can retry them.
            }
          }
        }

        if (publication.playbackState !== null) {
          const ownedPlaybackState = ownership.playbackState;
          if (ownedPlaybackState?.owner !== owner) {
            publication.playbackState = null;
          } else if (
            ownedPlaybackState.value !== publication.playbackState ||
            session.playbackState !== ownedPlaybackState.value
          ) {
            ownership.playbackState = null;
            publication.playbackState = null;
          } else {
            try {
              session.playbackState = 'none';
              if (ownership.playbackState?.owner === owner) ownership.playbackState = null;
              publication.playbackState = null;
            } catch {
              // Keep failed releases owned so a later destroy can retry them.
            }
          }
        }

        if (publication.positionState) {
          if (ownership.positionState !== owner) {
            publication.positionState = false;
          } else if (typeof session.setPositionState === 'function') {
            try {
              // MediaSession exposes no readable position or action handler. Token ownership is the
              // strongest boundary available for those two lanes; direct outside replacement is opaque.
              session.setPositionState(undefined);
              if (ownership.positionState === owner) ownership.positionState = null;
              publication.positionState = false;
            } catch {
              // Keep failed releases owned so a later destroy can retry them.
            }
          }
        }

        pruneWebMediaSessionOwnership(session, ownership);
        pruneWebMediaSessionPublication(publications, session, publication);
      }
    },
    setActionHandler(action, handler) {
      const session = getWebMediaSession();
      if (session === null) return;
      try {
        // Some browsers throw for an action they do not support; treat that as a no-op.
        session.setActionHandler(
          action,
          handler === null ? null : (details) => handler(details as MediaSessionActionDetails),
        );
        const ownership = _webMediaSessionOwnership.get(session);
        const publication = publications.get(session);
        if (handler === null) {
          ownership?.actions.delete(action);
          publication?.actions.delete(action);
          if (ownership !== undefined) pruneWebMediaSessionOwnership(session, ownership);
          if (publication !== undefined) pruneWebMediaSessionPublication(publications, session, publication);
        } else {
          getWebMediaSessionOwnership(session).actions.set(action, owner);
          getWebMediaSessionPublication(publications, session).actions.add(action);
        }
      } catch {
        // Unsupported action — leave any prior registration provenance unchanged.
      }
    },
    setMetadata(metadata) {
      const session = getWebMediaSession();
      if (session === null) return;
      if (metadata === null) {
        session.metadata = null;
        const ownership = _webMediaSessionOwnership.get(session);
        const publication = publications.get(session);
        if (ownership !== undefined) {
          ownership.metadata = null;
          pruneWebMediaSessionOwnership(session, ownership);
        }
        if (publication !== undefined) {
          publication.metadata = null;
          pruneWebMediaSessionPublication(publications, session, publication);
        }
        return;
      }
      if (typeof MediaMetadata === 'undefined') return;
      const published = new MediaMetadata({
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        artwork: [...metadata.artwork],
      });
      session.metadata = published;
      getWebMediaSessionOwnership(session).metadata = { owner, value: published };
      getWebMediaSessionPublication(publications, session).metadata = published;
    },
    setPlaybackState(state) {
      const session = getWebMediaSession();
      if (session === null) return;
      session.playbackState = state;
      const ownership = _webMediaSessionOwnership.get(session);
      const publication = publications.get(session);
      if (state === 'none') {
        if (ownership !== undefined) {
          ownership.playbackState = null;
          pruneWebMediaSessionOwnership(session, ownership);
        }
        if (publication !== undefined) {
          publication.playbackState = null;
          pruneWebMediaSessionPublication(publications, session, publication);
        }
      } else {
        getWebMediaSessionOwnership(session).playbackState = { owner, value: state };
        getWebMediaSessionPublication(publications, session).playbackState = state;
      }
    },
    setPositionState(state) {
      const session = getWebMediaSession();
      if (session === null || typeof session.setPositionState !== 'function') return;
      // A null position clears the OS scrubber; the web API spells "clear" as an omitted argument.
      session.setPositionState(state ?? undefined);
      const ownership = _webMediaSessionOwnership.get(session);
      const publication = publications.get(session);
      if (state === null) {
        if (ownership !== undefined) {
          ownership.positionState = null;
          pruneWebMediaSessionOwnership(session, ownership);
        }
        if (publication !== undefined) {
          publication.positionState = false;
          pruneWebMediaSessionPublication(publications, session, publication);
        }
      } else {
        getWebMediaSessionOwnership(session).positionState = owner;
        getWebMediaSessionPublication(publications, session).positionState = true;
      }
    },
  };
}

// Frees what the installed backend published to the OS and clears the slot. Safe with nothing installed
// and safe to call twice — the second call finds an empty slot, which is what makes teardown exactly-once
// without a destroyed flag that could drift from the thing it describes.
export function destroyMediaSessionBackend(): void {
  const previous = [_custom, _host] as const;
  _custom = null;
  _host = null;
  releaseMediaSessionBackends(previous);
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
// True when a host backend occupies the host slot. See `hasPowerHostBackend` for why a host package
// asks instead of remembering: a host-local `_enabled` boolean is a second copy of a fact this package
// owns, and it goes stale the moment the slot is cleared.
//
// Reports the SLOT, not the effective backend: a custom backend takes precedence for callers but does
// not occupy this slot, so it must not suppress host installation.
export function hasMediaSessionHostBackend(): boolean {
  return _host !== null;
}

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
  destroyMediaSessionBackend();
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
  const previous = [_custom] as const;
  _custom = backend;
  releaseMediaSessionBackends(previous);
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
const _webMediaSessionOwnership = new WeakMap<MediaSession, WebMediaSessionOwnership>();

function getWebMediaSession(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null;
  return navigator.mediaSession;
}

function getWebMediaSessionOwnership(session: MediaSession): WebMediaSessionOwnership {
  const existing = _webMediaSessionOwnership.get(session);
  if (existing !== undefined) return existing;
  const created: WebMediaSessionOwnership = {
    actions: new Map(),
    metadata: null,
    playbackState: null,
    positionState: null,
  };
  _webMediaSessionOwnership.set(session, created);
  return created;
}

function getWebMediaSessionPublication(
  publications: Map<MediaSession, WebMediaSessionPublication>,
  session: MediaSession,
): WebMediaSessionPublication {
  const existing = publications.get(session);
  if (existing !== undefined) return existing;
  const created: WebMediaSessionPublication = {
    actions: new Set(),
    metadata: null,
    playbackState: null,
    positionState: false,
  };
  publications.set(session, created);
  return created;
}

function pruneWebMediaSessionOwnership(session: MediaSession, ownership: WebMediaSessionOwnership): void {
  if (
    _webMediaSessionOwnership.get(session) === ownership &&
    ownership.actions.size === 0 &&
    ownership.metadata === null &&
    ownership.playbackState === null &&
    ownership.positionState === null
  ) {
    _webMediaSessionOwnership.delete(session);
  }
}

function pruneWebMediaSessionPublication(
  publications: Map<MediaSession, WebMediaSessionPublication>,
  session: MediaSession,
  publication: WebMediaSessionPublication,
): void {
  if (
    publications.get(session) === publication &&
    publication.actions.size === 0 &&
    publication.metadata === null &&
    publication.playbackState === null &&
    !publication.positionState
  ) {
    publications.delete(session);
  }
}

// Destroys every backend that WAS referenced and is not referenced any more — exactly once each.
//
// ★ Ownership is per SLOT, and the same object may sit in two slots. Three cases this gets right that a
// `_custom ?? _host` teardown gets wrong:
//   - SHADOWED: installing a custom over a live host does not destroy the host; it is still owned.
//   - ALIASED: when custom and host are the same object, clearing custom must NOT destroy it, because the
//     host slot still references it.
//   - DISTINCT: clearing both must destroy BOTH, not just whichever the `??` chain reached first.
// Deduplicated by identity, so an aliased backend is destroyed once and never twice.
function releaseMediaSessionBackends(previous: readonly (Readonly<MediaSessionBackend> | null)[]): void {
  const retained = new Set<unknown>([_custom, _host].filter((slot) => slot !== null));
  const released = new Set<unknown>();
  for (const backend of previous) {
    if (backend === null || retained.has(backend) || released.has(backend)) continue;
    released.add(backend);
    backend.destroy?.();
  }
}

type IsAny<T> = 0 extends 1 & T ? true : false;
function assertSyncVoid<T>(value: T & (IsAny<T> extends true ? never : T extends void ? unknown : never)): void {
  void value;
}

interface WebMediaSessionOwnedValue<Value> {
  owner: object;
  value: Value;
}

interface WebMediaSessionOwnership {
  actions: Map<MediaSessionAction, object>;
  metadata: WebMediaSessionOwnedValue<MediaMetadata> | null;
  playbackState: WebMediaSessionOwnedValue<MediaSessionPlaybackState> | null;
  positionState: object | null;
}

interface WebMediaSessionPublication {
  actions: Set<MediaSessionAction>;
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState | null;
  positionState: boolean;
}
