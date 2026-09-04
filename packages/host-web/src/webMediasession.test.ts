import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { MediaSessionActionDetails } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { webHost } from './webHost';
import {
  createWebMediaSessionActionBackend,
  createWebMediaSessionBackend,
  initializeWebMediaSessionActionBackend,
  initializeWebMediaSessionBackend,
  webMediaSessionActionBackend,
  webMediaSessionBackend,
} from './webMediasession';

interface FakeMediaSession {
  handlers: Map<string, ((details: MediaSessionActionDetails) => void) | null>;
  metadata: unknown;
  playbackState: string;
  positionCalls: unknown[];
  positionState: unknown;
  setActionHandler(action: string, handler: ((details: MediaSessionActionDetails) => void) | null): void;
  setPositionState?: (state?: unknown) => void;
}

function installFakeMediaSession(): FakeMediaSession {
  const session: FakeMediaSession = {
    handlers: new Map(),
    metadata: null,
    playbackState: 'none',
    positionCalls: [],
    positionState: undefined,
    setActionHandler(action, handler) {
      this.handlers.set(action, handler);
    },
    setPositionState(state) {
      this.positionCalls.push(state);
      this.positionState = state;
    },
  };
  Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session });
  return session;
}

function removeMediaSession(): void {
  Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: undefined });
  delete (navigator as { mediaSession?: unknown }).mediaSession;
}

class FakeMediaMetadata {
  readonly album: string;
  readonly artist: string;
  readonly artwork: readonly unknown[];
  readonly title: string;
  constructor(init: { album: string; artist: string; artwork: readonly unknown[]; title: string }) {
    this.album = init.album;
    this.artist = init.artist;
    this.artwork = init.artwork;
    this.title = init.title;
  }
}

const METADATA = { album: 'Album', artist: 'Artist', artwork: [{ src: 'cover.png' }], title: 'Title' };
const POSITION = { duration: 100, playbackRate: 1, position: 20 };

beforeEach(() => {
  removeMediaSession();
  (globalThis as { MediaMetadata?: unknown }).MediaMetadata = FakeMediaMetadata;
});

afterEach(() => {
  removeMediaSession();
  delete (globalThis as { MediaMetadata?: unknown }).MediaMetadata;
});

describe('createWebMediaSessionActionBackend', () => {
  it('registers only requested actions and fanouts through one native handler per action', () => {
    const session = installFakeMediaSession();
    const nativeSet = vi.spyOn(session, 'setActionHandler');
    const backend = createWebMediaSessionActionBackend();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = backend.subscribe('play', first);
    const unsubscribeSecond = backend.subscribe('play', second);
    expect(unsubscribeFirst).toBeTypeOf('function');
    expect(unsubscribeSecond).toBeTypeOf('function');
    expect(nativeSet).toHaveBeenCalledTimes(1);
    expect(session.handlers.has('play')).toBe(true);
    expect(session.handlers.has('pause')).toBe(false);
    session.handlers.get('play')?.({ action: 'play' });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();

    unsubscribeFirst?.();
    expect(nativeSet).toHaveBeenCalledTimes(1);
    unsubscribeSecond?.();
    expect(nativeSet).toHaveBeenLastCalledWith('play', null);
  });

  it('returns null for session absence and unsupported actions without retaining a lane', () => {
    const backend = createWebMediaSessionActionBackend();
    expect(backend.subscribe('play', vi.fn())).toBeNull();
    const session = installFakeMediaSession();
    session.setActionHandler = () => {
      throw new DOMException('unsupported action', 'NotSupportedError');
    };
    expect(backend.subscribe('skipad', vi.fn())).toBeNull();
    expect(session.handlers.size).toBe(0);
  });

  it('pins unsubscribe to the original session identity', () => {
    const first = installFakeMediaSession();
    const backend = createWebMediaSessionActionBackend();
    const unsubscribe = backend.subscribe('pause', vi.fn());
    const current = installFakeMediaSession();
    const foreign = vi.fn();
    current.handlers.set('pause', foreign);
    unsubscribe?.();
    expect(first.handlers.get('pause')).toBeNull();
    expect(current.handlers.get('pause')).toBe(foreign);
  });

  it('preserves a newer provider action registration on older unsubscribe and destroy', () => {
    const session = installFakeMediaSession();
    const first = createWebMediaSessionActionBackend();
    const second = createWebMediaSessionActionBackend();
    const old = first.subscribe('nexttrack', vi.fn());
    const currentListener = vi.fn();
    second.subscribe('nexttrack', currentListener);
    const installed = session.handlers.get('nexttrack');
    old?.();
    first.destroy();
    expect(session.handlers.get('nexttrack')).toBe(installed);
    installed?.({ action: 'nexttrack' });
    expect(currentListener).toHaveBeenCalledOnce();
  });

  it('keeps a failed final unsubscribe live and retryable', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionActionBackend();
    const listener = vi.fn();
    const unsubscribe = backend.subscribe('stop', listener)!;
    const original = session.setActionHandler.bind(session);
    let attempts = 0;
    session.setActionHandler = (action, handler) => {
      if (handler === null && attempts++ === 0) throw new Error('temporary clear failure');
      original(action, handler);
    };
    expect(() => unsubscribe()).toThrow('temporary clear failure');
    session.handlers.get('stop')?.({ action: 'stop' });
    expect(listener).toHaveBeenCalledOnce();
    expect(() => unsubscribe()).not.toThrow();
    expect(session.handlers.get('stop')).toBeNull();
    unsubscribe();
    expect(attempts).toBe(2);
  });

  it('destroy releases surviving actions without touching command lanes and retries failures', () => {
    const session = installFakeMediaSession();
    const commands = createWebMediaSessionBackend();
    commands.setMetadata(METADATA);
    const actions = createWebMediaSessionActionBackend();
    actions.subscribe('play', vi.fn());
    actions.subscribe('pause', vi.fn());
    const original = session.setActionHandler.bind(session);
    let failed = false;
    session.setActionHandler = (action, handler) => {
      if (action === 'play' && handler === null && !failed) {
        failed = true;
        throw new Error('retry action release');
      }
      original(action, handler);
    };
    actions.destroy();
    expect(session.handlers.get('play')).toBeTypeOf('function');
    expect(session.handlers.get('pause')).toBeNull();
    expect(session.metadata).toBeInstanceOf(FakeMediaMetadata);
    actions.destroy();
    expect(session.handlers.get('play')).toBeNull();
    expect(session.metadata).toBeInstanceOf(FakeMediaMetadata);
    actions.destroy();
    commands.destroy();
    expect(session.metadata).toBeNull();
  });
});

describe('createWebMediaSessionBackend', () => {
  it('reports session absence for every otherwise-valid command', () => {
    const backend = createWebMediaSessionBackend();
    expect(backend.setMetadata(METADATA)).toEqual({ reason: 'media-session-unavailable' });
    expect(backend.clearMetadata()).toEqual({ reason: 'media-session-unavailable' });
    expect(backend.setPlaybackState('playing')).toEqual({ reason: 'media-session-unavailable' });
    expect(backend.setPositionState(POSITION)).toEqual({ reason: 'media-session-unavailable' });
    expect(backend.clearPositionState()).toEqual({ reason: 'media-session-unavailable' });
  });

  it('reports MediaMetadata absence only for metadata set', () => {
    installFakeMediaSession();
    delete (globalThis as { MediaMetadata?: unknown }).MediaMetadata;
    const backend = createWebMediaSessionBackend();
    expect(backend.setMetadata(METADATA)).toEqual({ reason: 'media-metadata-unavailable' });
    expect(backend.clearMetadata()).toEqual({ reason: 'ok' });
  });

  it('maps only MediaMetadata construction TypeError to invalid-artwork-source', () => {
    installFakeMediaSession();
    (globalThis as { MediaMetadata?: unknown }).MediaMetadata = class {
      constructor() {
        throw new TypeError('bad artwork URL');
      }
    };
    expect(createWebMediaSessionBackend().setMetadata(METADATA)).toEqual({ reason: 'invalid-artwork-source' });
  });

  it('maps a non-TypeError metadata construction failure to operation-failed', () => {
    installFakeMediaSession();
    (globalThis as { MediaMetadata?: unknown }).MediaMetadata = class {
      constructor() {
        throw new Error('unexpected constructor failure');
      }
    };
    expect(createWebMediaSessionBackend().setMetadata(METADATA)).toEqual({ reason: 'operation-failed' });
  });

  it('isolates assignment failures from metadata construction classification', () => {
    const session = installFakeMediaSession();
    Object.defineProperty(session, 'metadata', {
      configurable: true,
      get: () => null,
      set: () => {
        throw new DOMException('platform refusal', 'InvalidStateError');
      },
    });
    expect(createWebMediaSessionBackend().setMetadata(METADATA)).toEqual({ reason: 'operation-failed' });
  });

  it('maps clear and playback setter exceptions to operation-failed', () => {
    const session = installFakeMediaSession();
    Object.defineProperty(session, 'metadata', {
      configurable: true,
      get: () => 'held',
      set: () => {
        throw new Error('clear failed');
      },
    });
    Object.defineProperty(session, 'playbackState', {
      configurable: true,
      get: () => 'none',
      set: () => {
        throw new Error('playback failed');
      },
    });
    const backend = createWebMediaSessionBackend();
    expect(backend.clearMetadata()).toEqual({ reason: 'operation-failed' });
    expect(backend.setPlaybackState('playing')).toEqual({ reason: 'operation-failed' });
  });

  it('reports position method absence for set and clear only', () => {
    const session = installFakeMediaSession();
    delete session.setPositionState;
    const backend = createWebMediaSessionBackend();
    expect(backend.setPositionState(POSITION)).toEqual({ reason: 'position-state-unavailable' });
    expect(backend.clearPositionState()).toEqual({ reason: 'position-state-unavailable' });
    expect(backend.setPlaybackState('playing')).toEqual({ reason: 'ok' });
  });

  it('maps position method exceptions and successful clears exactly', () => {
    const session = installFakeMediaSession();
    session.setPositionState = () => {
      throw new TypeError('platform position refusal');
    };
    const failed = createWebMediaSessionBackend();
    expect(failed.setPositionState(POSITION)).toEqual({ reason: 'operation-failed' });
    expect(failed.clearPositionState()).toEqual({ reason: 'operation-failed' });

    const next = installFakeMediaSession();
    const working = createWebMediaSessionBackend();
    expect(working.setPositionState(POSITION)).toEqual({ reason: 'ok' });
    expect(working.clearPositionState()).toEqual({ reason: 'ok' });
    expect(next.positionCalls).toEqual([POSITION, undefined]);
  });
});

describe('initializeWebMediaSessionActionBackend', () => {
  it('is the construction initializer of createWebMediaSessionActionBackend', () => {
    expect(typeof initializeWebMediaSessionActionBackend).toBe('function');
  });
});

describe('initializeWebMediaSessionBackend', () => {
  it('is the construction initializer of createWebMediaSessionBackend', () => {
    expect(typeof initializeWebMediaSessionBackend).toBe('function');
  });
});
describe('web media-session command ownership', () => {
  it('releases only lanes it published and never touches action handlers', () => {
    const session = installFakeMediaSession();
    const foreignAction = vi.fn();
    session.handlers.set('play', foreignAction);
    const backend = createWebMediaSessionBackend();
    backend.setMetadata(METADATA);
    backend.setPlaybackState('playing');
    backend.setPositionState(POSITION);

    backend.destroy();
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
    expect(session.positionState).toBeUndefined();
    expect(session.handlers.get('play')).toBe(foreignAction);
  });

  it('preserves readable lanes replaced directly outside Flight', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setMetadata(METADATA);
    backend.setPlaybackState('playing');
    const foreignMetadata = { title: 'Foreign' };
    session.metadata = foreignMetadata;
    session.playbackState = 'paused';
    backend.destroy();
    expect(session.metadata).toBe(foreignMetadata);
    expect(session.playbackState).toBe('paused');
  });

  it('preserves every lane superseded by a newer provider on the same session', () => {
    const session = installFakeMediaSession();
    const first = createWebMediaSessionBackend();
    const second = createWebMediaSessionBackend();
    first.setMetadata(METADATA);
    first.setPlaybackState('playing');
    first.setPositionState(POSITION);
    second.setMetadata({ ...METADATA, title: 'Second' });
    second.setPlaybackState('paused');
    const secondPosition = { ...POSITION, position: 30 };
    second.setPositionState(secondPosition);
    const metadata = session.metadata;
    const positionCalls = session.positionCalls.length;

    first.destroy();
    expect(session.metadata).toBe(metadata);
    expect(session.playbackState).toBe('paused');
    expect(session.positionState).toBe(secondPosition);
    expect(session.positionCalls).toHaveLength(positionCalls);

    second.destroy();
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
    expect(session.positionState).toBeUndefined();
  });

  it('releases the exact session identity it touched, not the current navigator session', () => {
    const firstSession = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setMetadata(METADATA);
    backend.setPlaybackState('playing');
    backend.setPositionState(POSITION);
    const current = installFakeMediaSession();
    current.metadata = { title: 'Current' };
    current.playbackState = 'paused';
    current.positionState = { ...POSITION, position: 40 };

    backend.destroy();
    expect(firstSession.metadata).toBeNull();
    expect(firstSession.playbackState).toBe('none');
    expect(firstSession.positionState).toBeUndefined();
    expect(current.metadata).toEqual({ title: 'Current' });
    expect(current.playbackState).toBe('paused');
    expect(current.positionState).toEqual({ ...POSITION, position: 40 });
  });

  it('relinquishes explicitly cleared lanes so later foreign values survive destroy', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setMetadata(METADATA);
    backend.setPlaybackState('playing');
    backend.setPositionState(POSITION);
    backend.clearMetadata();
    backend.setPlaybackState('none');
    backend.clearPositionState();
    const foreignMetadata = { title: 'Foreign' };
    const foreignPosition = { ...POSITION, position: 60 };
    session.metadata = foreignMetadata;
    session.playbackState = 'paused';
    session.positionState = foreignPosition;
    const calls = session.positionCalls.length;
    backend.destroy();
    expect(session.metadata).toBe(foreignMetadata);
    expect(session.playbackState).toBe('paused');
    expect(session.positionState).toBe(foreignPosition);
    expect(session.positionCalls).toHaveLength(calls);
  });

  it('keeps failed lane releases retryable and becomes idempotent after success', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setMetadata(METADATA);
    backend.setPlaybackState('playing');
    backend.setPositionState(POSITION);
    let metadata = session.metadata;
    let playback = session.playbackState;
    let metadataAttempts = 0;
    let playbackAttempts = 0;
    let positionAttempts = 0;
    Object.defineProperty(session, 'metadata', {
      configurable: true,
      get: () => metadata,
      set: (value) => {
        if (value === null && metadataAttempts++ === 0) throw new Error('metadata clear');
        metadata = value;
      },
    });
    Object.defineProperty(session, 'playbackState', {
      configurable: true,
      get: () => playback,
      set: (value) => {
        if (value === 'none' && playbackAttempts++ === 0) throw new Error('playback clear');
        playback = value;
      },
    });
    const originalPosition = session.setPositionState!;
    session.setPositionState = (value) => {
      if (value === undefined && positionAttempts++ === 0) throw new Error('position clear');
      originalPosition.call(session, value);
    };

    backend.destroy();
    expect([metadataAttempts, playbackAttempts, positionAttempts]).toEqual([1, 1, 1]);
    backend.destroy();
    expect([metadataAttempts, playbackAttempts, positionAttempts]).toEqual([2, 2, 2]);
    expect(metadata).toBeNull();
    expect(playback).toBe('none');
    expect(session.positionState).toBeUndefined();
    backend.destroy();
    expect([metadataAttempts, playbackAttempts, positionAttempts]).toEqual([2, 2, 2]);
  });
});

describe('web media-session provider composition', () => {
  it('backs both singleton Host slots and fresh factories with Entities', () => {
    expect(EntityRuntimeKey in webMediaSessionBackend).toBe(true);
    expect(EntityRuntimeKey in webMediaSessionActionBackend).toBe(true);
    expect(EntityRuntimeKey in createWebMediaSessionBackend()).toBe(true);
    expect(EntityRuntimeKey in createWebMediaSessionActionBackend()).toBe(true);
    expect(webHost.media.session).toBe(webMediaSessionBackend);
    expect(webHost.media.sessionAction).toBe(webMediaSessionActionBackend);
  });
});
