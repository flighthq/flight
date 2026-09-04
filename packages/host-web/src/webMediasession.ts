import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  MediaSessionAction,
  MediaSessionActionBackend,
  MediaSessionActionDetails,
  MediaSessionBackend,
  MediaSessionMetadata,
  MediaSessionPlaybackState,
} from '@flighthq/types/contract';

const OK = { reason: 'ok' } as const;
const INVALID_ARTWORK_SOURCE = { reason: 'invalid-artwork-source' } as const;
const MEDIA_METADATA_UNAVAILABLE = { reason: 'media-metadata-unavailable' } as const;
const MEDIA_SESSION_UNAVAILABLE = { reason: 'media-session-unavailable' } as const;
const OPERATION_FAILED = { reason: 'operation-failed' } as const;
const POSITION_STATE_UNAVAILABLE = { reason: 'position-state-unavailable' } as const;
const _webMediaSessionOwnership = new WeakMap<MediaSession, WebMediaSessionOwnership>();

// Web event provider. Subscribers to the same action share one native handler; different actions are
// never registered speculatively. Each returned unsubscribe remains pinned to its exact session,
// action, lane token and subscription record even if navigator.mediaSession later changes.
export function createWebMediaSessionActionBackend(): MediaSessionActionBackend {
  const lanes = new Map<MediaSession, Map<MediaSessionAction, WebMediaSessionActionLane>>();

  const finishLane = (lane: WebMediaSessionActionLane): void => {
    for (const subscription of lane.subscriptions) subscription.detached = true;
    lane.subscriptions.clear();
    const sessionLanes = lanes.get(lane.session);
    if (sessionLanes?.get(lane.action) === lane) sessionLanes.delete(lane.action);
    if (sessionLanes?.size === 0) lanes.delete(lane.session);
    const ownership = _webMediaSessionOwnership.get(lane.session);
    if (ownership?.actions.get(lane.action) === lane.token) ownership.actions.delete(lane.action);
    if (ownership !== undefined) pruneWebMediaSessionOwnership(lane.session, ownership);
  };

  const release = (lane: WebMediaSessionActionLane, subscription: WebMediaSessionActionSubscription): void => {
    if (subscription.detached || !lane.subscriptions.has(subscription)) return;
    if (lane.subscriptions.size > 1) {
      lane.subscriptions.delete(subscription);
      subscription.detached = true;
      return;
    }

    const ownership = _webMediaSessionOwnership.get(lane.session);
    if (ownership?.actions.get(lane.action) !== lane.token) {
      finishLane(lane);
      return;
    }
    // Do not mark the final subscription detached before this succeeds. A throw leaves both the native
    // handler and this exact unsubscribe live, so the caller can retry without losing provenance.
    assertSyncVoid(lane.session.setActionHandler(lane.action, null));
    finishLane(lane);
  };

  const backend: Pick<MediaSessionActionBackend, 'destroy' | 'subscribe'> = {
    destroy() {
      for (const sessionLanes of [...lanes.values()]) {
        for (const lane of [...sessionLanes.values()]) {
          const ownership = _webMediaSessionOwnership.get(lane.session);
          if (ownership?.actions.get(lane.action) !== lane.token) {
            finishLane(lane);
            continue;
          }
          try {
            assertSyncVoid(lane.session.setActionHandler(lane.action, null));
            assertSyncVoid(finishLane(lane));
          } catch {
            // Preserve the lane and all subscriptions for a later destroy/unsubscribe retry.
          }
        }
      }
    },

    subscribe(action, listener) {
      const session = getWebMediaSession();
      if (session === null || typeof session.setActionHandler !== 'function') return null;
      let sessionLanes = lanes.get(session);
      let lane = sessionLanes?.get(action);
      const ownership = getWebMediaSessionOwnership(session);

      // A newer provider replaced this provider's unreadable native handler. Its old subscription
      // records cannot truthfully resume, so retire that stale lane before registering a new one.
      if (lane !== undefined && ownership.actions.get(action) !== lane.token) {
        finishLane(lane);
        lane = undefined;
        sessionLanes = lanes.get(session);
      }

      if (lane === undefined) {
        const token = {};
        lane = { action, session, subscriptions: new Set(), token };
        const installedLane = lane;
        const handler = (details: MediaSessionActionDetails): void => {
          const current = _webMediaSessionOwnership.get(session);
          if (current?.actions.get(action) !== token) return;
          for (const subscription of [...installedLane.subscriptions]) {
            if (!subscription.detached) subscription.listener(details);
          }
        };
        const prior = ownership.actions.get(action);
        ownership.actions.set(action, token);
        try {
          assertSyncVoid(session.setActionHandler(action, (details) => handler(details as MediaSessionActionDetails)));
        } catch {
          if (ownership.actions.get(action) === token) {
            if (prior === undefined) ownership.actions.delete(action);
            else ownership.actions.set(action, prior);
          }
          pruneWebMediaSessionOwnership(session, ownership);
          return null;
        }
        sessionLanes ??= new Map();
        sessionLanes.set(action, lane);
        lanes.set(session, sessionLanes);
      }

      const subscription: WebMediaSessionActionSubscription = { detached: false, listener };
      lane.subscriptions.add(subscription);
      return () => release(lane!, subscription);
    },
  };

  return createEntity(backend);
}

// Web command provider. Every publication is pinned to the exact MediaSession identity and an opaque
// owner token. Readable lanes additionally compare the exact value before release; the opaque position
// lane uses the strongest boundary the browser exposes, its provenance token.
export function createWebMediaSessionBackend(): MediaSessionBackend {
  const owner = {};
  const publications = new Map<MediaSession, WebMediaSessionCommandPublication>();

  const backend: Pick<
    MediaSessionBackend,
    'clearMetadata' | 'clearPositionState' | 'destroy' | 'setMetadata' | 'setPlaybackState' | 'setPositionState'
  > = {
    clearMetadata() {
      const session = getWebMediaSession();
      if (session === null) return MEDIA_SESSION_UNAVAILABLE;
      const ownership = getWebMediaSessionOwnership(session);
      const prior = ownership.metadata;
      try {
        session.metadata = null;
      } catch {
        return OPERATION_FAILED;
      }
      // Preserve a provider that synchronously republished from the platform setter.
      if (ownership.metadata === prior) ownership.metadata = null;
      const publication = publications.get(session);
      if (publication !== undefined) {
        publication.metadata = null;
        pruneCommandPublication(publications, session, publication);
      }
      pruneWebMediaSessionOwnership(session, ownership);
      return OK;
    },

    clearPositionState() {
      const session = getWebMediaSession();
      if (session === null) return MEDIA_SESSION_UNAVAILABLE;
      if (typeof session.setPositionState !== 'function') return POSITION_STATE_UNAVAILABLE;
      const ownership = getWebMediaSessionOwnership(session);
      const prior = ownership.positionState;
      try {
        assertSyncVoid(session.setPositionState(undefined));
      } catch {
        return OPERATION_FAILED;
      }
      if (ownership.positionState === prior) ownership.positionState = null;
      const publication = publications.get(session);
      if (publication !== undefined) {
        publication.positionState = false;
        pruneCommandPublication(publications, session, publication);
      }
      pruneWebMediaSessionOwnership(session, ownership);
      return OK;
    },

    destroy() {
      for (const [session, publication] of publications) {
        const ownership = _webMediaSessionOwnership.get(session);
        if (ownership === undefined) {
          publications.delete(session);
          continue;
        }

        if (publication.metadata !== null) {
          const owned = ownership.metadata;
          if (owned?.owner !== owner) publication.metadata = null;
          else if (owned.value !== publication.metadata || session.metadata !== owned.value) {
            ownership.metadata = null;
            publication.metadata = null;
          } else {
            try {
              session.metadata = null;
              if (ownership.metadata === owned) ownership.metadata = null;
              publication.metadata = null;
            } catch {
              // Retain ownership/publication so a later destroy retries this exact lane.
            }
          }
        }

        if (publication.playbackState !== null) {
          const owned = ownership.playbackState;
          if (owned?.owner !== owner) publication.playbackState = null;
          else if (owned.value !== publication.playbackState || session.playbackState !== owned.value) {
            ownership.playbackState = null;
            publication.playbackState = null;
          } else {
            try {
              session.playbackState = 'none';
              if (ownership.playbackState === owned) ownership.playbackState = null;
              publication.playbackState = null;
            } catch {
              // Retain ownership/publication so a later destroy retries this exact lane.
            }
          }
        }

        if (publication.positionState) {
          if (ownership.positionState !== owner) publication.positionState = false;
          else if (typeof session.setPositionState === 'function') {
            try {
              assertSyncVoid(session.setPositionState(undefined));
              if (ownership.positionState === owner) ownership.positionState = null;
              publication.positionState = false;
            } catch {
              // Retain ownership/publication so a later destroy retries this exact lane.
            }
          }
        }

        pruneWebMediaSessionOwnership(session, ownership);
        pruneCommandPublication(publications, session, publication);
      }
    },

    setMetadata(metadata: Readonly<MediaSessionMetadata>) {
      const session = getWebMediaSession();
      if (session === null) return MEDIA_SESSION_UNAVAILABLE;
      if (typeof MediaMetadata === 'undefined') return MEDIA_METADATA_UNAVAILABLE;

      let published: MediaMetadata;
      try {
        // Isolated deliberately: the specification assigns TypeError to invalid artwork URLs. Later
        // artwork fetch/decode/UI display is asynchronous and cannot be observed by this command.
        published = new MediaMetadata({
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          artwork: [...metadata.artwork],
        });
      } catch (error) {
        return error instanceof TypeError ? INVALID_ARTWORK_SOURCE : OPERATION_FAILED;
      }

      const ownership = getWebMediaSessionOwnership(session);
      const prior = ownership.metadata;
      const record = { owner, value: published };
      ownership.metadata = record;
      try {
        session.metadata = published;
      } catch {
        if (ownership.metadata === record) ownership.metadata = prior;
        pruneWebMediaSessionOwnership(session, ownership);
        return OPERATION_FAILED;
      }
      // A synchronous successor owns the lane; do not add this stale publication to our roster.
      if (ownership.metadata !== record) return OK;
      getCommandPublication(publications, session).metadata = published;
      return OK;
    },

    setPlaybackState(state: MediaSessionPlaybackState) {
      const session = getWebMediaSession();
      if (session === null) return MEDIA_SESSION_UNAVAILABLE;
      const ownership = getWebMediaSessionOwnership(session);
      const prior = ownership.playbackState;
      const record = state === 'none' ? null : { owner, value: state };
      ownership.playbackState = record;
      try {
        session.playbackState = state;
      } catch {
        if (ownership.playbackState === record) ownership.playbackState = prior;
        pruneWebMediaSessionOwnership(session, ownership);
        return OPERATION_FAILED;
      }
      if (ownership.playbackState !== record) return OK;
      const publication = publications.get(session);
      if (state === 'none') {
        if (publication !== undefined) {
          publication.playbackState = null;
          pruneCommandPublication(publications, session, publication);
        }
        pruneWebMediaSessionOwnership(session, ownership);
      } else {
        getCommandPublication(publications, session).playbackState = state;
      }
      return OK;
    },

    setPositionState(state) {
      const session = getWebMediaSession();
      if (session === null) return MEDIA_SESSION_UNAVAILABLE;
      if (typeof session.setPositionState !== 'function') return POSITION_STATE_UNAVAILABLE;
      const ownership = getWebMediaSessionOwnership(session);
      const prior = ownership.positionState;
      ownership.positionState = owner;
      try {
        assertSyncVoid(session.setPositionState(state));
      } catch {
        if (ownership.positionState === owner) ownership.positionState = prior;
        pruneWebMediaSessionOwnership(session, ownership);
        return OPERATION_FAILED;
      }
      if (ownership.positionState === owner) getCommandPublication(publications, session).positionState = true;
      return OK;
    },
  };

  return createEntity(backend);
}

export const webMediaSessionBackend = createWebMediaSessionBackend();
export const webMediaSessionActionBackend = createWebMediaSessionActionBackend();

function getWebMediaSession(): MediaSession | null {
  if (typeof navigator === 'undefined' || navigator.mediaSession === undefined) return null;
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

function getCommandPublication(
  publications: Map<MediaSession, WebMediaSessionCommandPublication>,
  session: MediaSession,
): WebMediaSessionCommandPublication {
  const existing = publications.get(session);
  if (existing !== undefined) return existing;
  const created: WebMediaSessionCommandPublication = {
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

function pruneCommandPublication(
  publications: Map<MediaSession, WebMediaSessionCommandPublication>,
  session: MediaSession,
  publication: WebMediaSessionCommandPublication,
): void {
  if (
    publications.get(session) === publication &&
    publication.metadata === null &&
    publication.playbackState === null &&
    !publication.positionState
  ) {
    publications.delete(session);
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

interface WebMediaSessionCommandPublication {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState | null;
  positionState: boolean;
}

interface WebMediaSessionActionLane {
  readonly action: MediaSessionAction;
  readonly session: MediaSession;
  readonly subscriptions: Set<WebMediaSessionActionSubscription>;
  readonly token: object;
}

interface WebMediaSessionActionSubscription {
  detached: boolean;
  readonly listener: (details: Readonly<MediaSessionActionDetails>) => void;
}
