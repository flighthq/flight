import type { MediaSessionActionDetails, MediaSessionBackend, MediaSessionOperation } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearMediaSessionActionHandler,
  clearMediaSessionMetadata,
  clearMediaSessionPositionState,
  createWebMediaSessionBackend,
  destroyMediaSessionBackend,
  explainMediaSessionBackend,
  explainMediaSessionOperation,
  getMediaSessionBackend,
  hasMediaSessionHostBackend,
  hasMediaSessionOperation,
  installMediaSessionHostBackend,
  observeMediaSessionHostResult,
  resetMediaSessionBackendForTest,
  setMediaSessionActionHandler,
  setMediaSessionBackend,
  setMediaSessionMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
} from './mediasession';

interface FakeMediaSession {
  metadata: unknown;
  playbackState: string;
  positionCalls: unknown[];
  positionState: unknown;
  handlers: Map<string, ((details: MediaSessionActionDetails) => void) | null>;
  setPositionState?: (state?: unknown) => void;
  setActionHandler(action: string, handler: ((details: MediaSessionActionDetails) => void) | null): void;
}

function createFakeBackend(): MediaSessionBackend & { calls: string[]; args: unknown[][] } {
  const calls: string[] = [];
  const args: unknown[][] = [];
  return {
    calls,
    args,
    setMetadata(metadata) {
      calls.push('setMetadata');
      args.push([metadata]);
    },
    setPlaybackState(state) {
      calls.push('setPlaybackState');
      args.push([state]);
    },
    setPositionState(state) {
      calls.push('setPositionState');
      args.push([state]);
    },
    setActionHandler(action, handler) {
      calls.push('setActionHandler');
      args.push([action, handler]);
    },
  };
}

function installFakeMediaSession(unsupportedAction?: string): FakeMediaSession {
  const session: FakeMediaSession = {
    metadata: undefined,
    playbackState: 'none',
    positionCalls: [],
    positionState: undefined,
    handlers: new Map(),
    setPositionState(state?: unknown) {
      this.positionCalls.push(state);
      this.positionState = state;
    },
    setActionHandler(action, handler) {
      if (action === unsupportedAction) throw new Error('unsupported action');
      this.handlers.set(action, handler);
    },
  };
  Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true });
  return session;
}

function publishAllMediaSessionLanes(
  backend: Readonly<MediaSessionBackend>,
  title: string,
  handler: (details: Readonly<MediaSessionActionDetails>) => void,
): void {
  backend.setMetadata!({ title, artist: `${title} Artist`, album: `${title} Album`, artwork: [] });
  backend.setPlaybackState!('playing');
  backend.setPositionState!({ duration: 100, playbackRate: 1, position: 10 });
  backend.setActionHandler!('play', handler);
}

function removeMediaSession(): void {
  if ('mediaSession' in navigator) {
    Object.defineProperty(navigator, 'mediaSession', { value: undefined, configurable: true });
    delete (navigator as { mediaSession?: unknown }).mediaSession;
  }
}

class FakeMediaMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: readonly unknown[];
  constructor(init: { title: string; artist: string; album: string; artwork: readonly unknown[] }) {
    this.title = init.title;
    this.artist = init.artist;
    this.album = init.album;
    this.artwork = init.artwork;
  }
}

beforeEach(() => {
  setMediaSessionBackend(null);
  removeMediaSession();
  (globalThis as { MediaMetadata?: unknown }).MediaMetadata = FakeMediaMetadata;
});

afterEach(() => {
  setMediaSessionBackend(null);
  removeMediaSession();
  delete (globalThis as { MediaMetadata?: unknown }).MediaMetadata;
});

describe('clearMediaSessionActionHandler', () => {
  it('routes a null action handler through the active backend', () => {
    const fake = createFakeBackend();
    setMediaSessionBackend(fake);
    clearMediaSessionActionHandler('play');
    expect(fake.calls).toEqual(['setActionHandler']);
    expect(fake.args[0]).toEqual(['play', null]);
  });

  it('unregisters the web handler for the action', () => {
    const session = installFakeMediaSession();
    setMediaSessionBackend(createWebMediaSessionBackend());
    setMediaSessionActionHandler('pause', () => {});
    clearMediaSessionActionHandler('pause');
    expect(session.handlers.get('pause')).toBeNull();
  });
});

describe('clearMediaSessionMetadata', () => {
  it('routes a null metadata set through the active backend', () => {
    const fake = createFakeBackend();
    setMediaSessionBackend(fake);
    clearMediaSessionMetadata();
    expect(fake.calls).toEqual(['setMetadata']);
    expect(fake.args[0]).toEqual([null]);
  });

  it('assigns null to the web session metadata', () => {
    const session = installFakeMediaSession();
    setMediaSessionBackend(createWebMediaSessionBackend());
    setMediaSessionMetadata({ title: 'A', artist: 'B', album: 'C', artwork: [] });
    clearMediaSessionMetadata();
    expect(session.metadata).toBeNull();
  });
});

describe('clearMediaSessionPositionState', () => {
  it('routes a null position through the active backend', () => {
    const fake = createFakeBackend();
    setMediaSessionBackend(fake);
    clearMediaSessionPositionState();
    expect(fake.calls).toEqual(['setPositionState']);
    expect(fake.args[0]).toEqual([null]);
  });

  it('clears the web position by passing undefined', () => {
    const session = installFakeMediaSession();
    setMediaSessionBackend(createWebMediaSessionBackend());
    clearMediaSessionPositionState();
    expect(session.positionCalls).toEqual([undefined]);
  });
});

describe('createWebMediaSessionBackend', () => {
  it('sets metadata via a MediaMetadata instance', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setMetadata!({ title: 'Song', artist: 'Artist', album: 'Album', artwork: [{ src: 'a.png' }] });
    expect(session.metadata).toBeInstanceOf(FakeMediaMetadata);
    expect((session.metadata as FakeMediaMetadata).title).toBe('Song');
    expect((session.metadata as FakeMediaMetadata).artwork).toEqual([{ src: 'a.png' }]);
  });

  it('does not construct MediaMetadata when it is absent', () => {
    const session = installFakeMediaSession();
    delete (globalThis as { MediaMetadata?: unknown }).MediaMetadata;
    const backend = createWebMediaSessionBackend();
    session.metadata = 'unchanged';
    backend.setMetadata!({ title: 'Song', artist: 'Artist', album: 'Album', artwork: [] });
    expect(session.metadata).toBe('unchanged');
  });

  it('assigns the playback state', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setPlaybackState!('playing');
    expect(session.playbackState).toBe('playing');
  });

  it('forwards the position state to setPositionState', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setPositionState!({ duration: 100, playbackRate: 1, position: 10 });
    expect(session.positionCalls).toEqual([{ duration: 100, playbackRate: 1, position: 10 }]);
  });

  it('no-ops setPositionState when the method is absent', () => {
    const session = installFakeMediaSession();
    delete session.setPositionState;
    const backend = createWebMediaSessionBackend();
    expect(() => backend.setPositionState!({ duration: 1, playbackRate: 1, position: 0 })).not.toThrow();
  });

  it('registers an action handler and maps fired details to the caller', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    const handler = vi.fn();
    backend.setActionHandler!('seekto', handler);
    const registered = session.handlers.get('seekto');
    expect(registered).toBeTypeOf('function');
    registered?.({ action: 'seekto', seekTime: 42, fastSeek: true });
    expect(handler).toHaveBeenCalledWith({ action: 'seekto', seekTime: 42, fastSeek: true });
  });

  it('swallows an unsupported-action throw from setActionHandler', () => {
    const session = installFakeMediaSession('skipad');
    const backend = createWebMediaSessionBackend();
    expect(() => backend.setActionHandler!('skipad', () => {})).not.toThrow();
    expect(session.handlers.has('skipad')).toBe(false);
  });

  it('is a no-op in an environment without navigator.mediaSession', () => {
    removeMediaSession();
    const backend = createWebMediaSessionBackend();
    expect(() => {
      backend.setMetadata!({ title: 'A', artist: 'B', album: 'C', artwork: [] });
      backend.setMetadata!(null);
      backend.setPlaybackState!('paused');
      backend.setPositionState!({ duration: 1, playbackRate: 1, position: 0 });
      backend.setPositionState!(null);
      backend.setActionHandler!('play', () => {});
      backend.setActionHandler!('play', null);
    }).not.toThrow();
  });
});

describe('createWebMediaSessionBackend destroy', () => {
  afterEach(() => resetMediaSessionBackendForTest());

  it('preserves untouched lanes while clearing the one action it published', () => {
    const session = installFakeMediaSession();
    const foreignMetadata = { title: 'Foreign' };
    const foreignPosition = { duration: 20, playbackRate: 1, position: 5 };
    const foreignPauseHandler = vi.fn();
    session.metadata = foreignMetadata;
    session.playbackState = 'paused';
    session.positionState = foreignPosition;
    session.handlers.set('pause', foreignPauseHandler);
    const backend = createWebMediaSessionBackend();
    backend.setActionHandler!('play', () => undefined);
    backend.destroy!();

    expect(session.metadata).toBe(foreignMetadata);
    expect(session.playbackState).toBe('paused');
    expect(session.positionState).toBe(foreignPosition);
    expect(session.positionCalls).toEqual([]);
    expect(session.handlers.get('pause')).toBe(foreignPauseHandler);
    expect(session.handlers.get('play')).toBeNull();
  });

  it.each(['metadata', 'playbackState', 'positionState', 'action'] as const)(
    'acquires and releases only the %s lane',
    (lane) => {
      const session = installFakeMediaSession();
      const foreignMetadata = { title: 'Foreign' };
      const foreignPosition = { duration: 20, playbackRate: 1, position: 5 };
      const foreignPauseHandler = vi.fn();
      session.metadata = foreignMetadata;
      session.playbackState = 'paused';
      session.positionState = foreignPosition;
      session.handlers.set('pause', foreignPauseHandler);
      const backend = createWebMediaSessionBackend();

      if (lane === 'metadata') {
        backend.setMetadata!({ title: 'Owned', artist: 'Artist', album: 'Album', artwork: [] });
      } else if (lane === 'playbackState') {
        backend.setPlaybackState!('playing');
      } else if (lane === 'positionState') {
        backend.setPositionState!({ duration: 100, playbackRate: 1, position: 10 });
      } else {
        backend.setActionHandler!('play', () => undefined);
      }

      backend.destroy!();

      expect(session.metadata).toBe(lane === 'metadata' ? null : foreignMetadata);
      expect(session.playbackState).toBe(lane === 'playbackState' ? 'none' : 'paused');
      expect(session.positionState).toBe(lane === 'positionState' ? undefined : foreignPosition);
      expect(session.handlers.get('play')).toBe(lane === 'action' ? null : undefined);
      expect(session.handlers.get('pause')).toBe(foreignPauseHandler);
    },
  );

  it('keeps an action publication owned when the position lane is explicitly cleared', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setActionHandler!('play', () => undefined);
    backend.setPositionState!({ duration: 100, playbackRate: 1, position: 10 });

    backend.setPositionState!(null);
    backend.destroy!();

    expect(session.handlers.get('play')).toBeNull();
  });

  it('keeps a metadata publication owned when the action lane is explicitly cleared', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setMetadata!({ title: 'Owned', artist: 'Artist', album: 'Album', artwork: [] });
    backend.setActionHandler!('play', () => undefined);

    backend.setActionHandler!('play', null);
    backend.destroy!();

    expect(session.metadata).toBeNull();
  });

  it('keeps a playback publication owned when the action lane is explicitly cleared', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setPlaybackState!('playing');
    backend.setActionHandler!('play', () => undefined);

    backend.setActionHandler!('play', null);
    backend.destroy!();

    expect(session.playbackState).toBe('none');
  });

  it('relinquishes every lane after an explicit clear', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    publishAllMediaSessionLanes(backend, 'Owned', () => undefined);

    backend.setMetadata!(null);
    backend.setPlaybackState!('none');
    backend.setPositionState!(null);
    backend.setActionHandler!('play', null);

    const foreignMetadata = { title: 'Foreign' };
    const foreignPosition = { duration: 40, playbackRate: 1, position: 8 };
    const foreignPlayHandler = vi.fn();
    session.metadata = foreignMetadata;
    session.playbackState = 'paused';
    session.positionState = foreignPosition;
    session.handlers.set('play', foreignPlayHandler);
    const positionCallCount = session.positionCalls.length;

    backend.destroy!();

    expect(session.metadata).toBe(foreignMetadata);
    expect(session.playbackState).toBe('paused');
    expect(session.positionState).toBe(foreignPosition);
    expect(session.positionCalls).toHaveLength(positionCallCount);
    expect(session.handlers.get('play')).toBe(foreignPlayHandler);
  });

  it('makes explicit clears on a pristine backend final', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setMetadata!(null);
    backend.setPlaybackState!('none');
    backend.setPositionState!(null);
    backend.setActionHandler!('play', null);

    const foreignMetadata = { title: 'Foreign' };
    const foreignPosition = { duration: 40, playbackRate: 1, position: 8 };
    const foreignPlayHandler = vi.fn();
    session.metadata = foreignMetadata;
    session.playbackState = 'paused';
    session.positionState = foreignPosition;
    session.handlers.set('play', foreignPlayHandler);
    const positionCallCount = session.positionCalls.length;

    backend.destroy!();

    expect(session.metadata).toBe(foreignMetadata);
    expect(session.playbackState).toBe('paused');
    expect(session.positionState).toBe(foreignPosition);
    expect(session.positionCalls).toHaveLength(positionCallCount);
    expect(session.handlers.get('play')).toBe(foreignPlayHandler);
  });

  it('drops stale publications after another backend explicitly clears their ownership', () => {
    const session = installFakeMediaSession();
    const publisher = createWebMediaSessionBackend();
    const clearer = createWebMediaSessionBackend();
    publishAllMediaSessionLanes(publisher, 'Owned', () => undefined);
    clearer.setMetadata!(null);
    clearer.setPlaybackState!('none');
    clearer.setPositionState!(null);
    clearer.setActionHandler!('play', null);

    const foreignMetadata = { title: 'Foreign' };
    const foreignPosition = { duration: 40, playbackRate: 1, position: 8 };
    const foreignPlayHandler = vi.fn();
    session.metadata = foreignMetadata;
    session.playbackState = 'paused';
    session.positionState = foreignPosition;
    session.handlers.set('play', foreignPlayHandler);
    const positionCallCount = session.positionCalls.length;

    publisher.destroy!();

    expect(session.metadata).toBe(foreignMetadata);
    expect(session.playbackState).toBe('paused');
    expect(session.positionState).toBe(foreignPosition);
    expect(session.positionCalls).toHaveLength(positionCallCount);
    expect(session.handlers.get('play')).toBe(foreignPlayHandler);
  });

  it('preserves every lane superseded by a newer backend on the same session', () => {
    const session = installFakeMediaSession();
    const first = createWebMediaSessionBackend();
    const second = createWebMediaSessionBackend();
    publishAllMediaSessionLanes(first, 'First', () => undefined);
    const secondHandler = vi.fn();
    publishAllMediaSessionLanes(second, 'Second', secondHandler);
    const secondMetadata = session.metadata;
    const secondPosition = session.positionState;
    const registeredSecondHandler = session.handlers.get('play');
    const positionCallCount = session.positionCalls.length;

    first.destroy!();

    expect(session.metadata).toBe(secondMetadata);
    expect(session.playbackState).toBe('playing');
    expect(session.positionState).toBe(secondPosition);
    expect(session.positionCalls).toHaveLength(positionCallCount);
    expect(session.handlers.get('play')).toBe(registeredSecondHandler);

    second.destroy!();
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
    expect(session.positionState).toBeUndefined();
    expect(session.handlers.get('play')).toBeNull();
  });

  it('preserves an action synchronously republished while an older backend releases it', () => {
    const session = installFakeMediaSession();
    const first = createWebMediaSessionBackend();
    const second = createWebMediaSessionBackend();
    const setActionHandler = session.setActionHandler.bind(session);
    const secondHandler = vi.fn();
    let republish = true;
    session.setActionHandler = (action, handler) => {
      setActionHandler(action, handler);
      if (action === 'play' && handler === null && republish) {
        republish = false;
        second.setActionHandler!(action, secondHandler);
      }
    };
    first.setActionHandler!('play', () => undefined);

    first.destroy!();

    const installedSecondHandler = session.handlers.get('play');
    expect(installedSecondHandler).not.toBeNull();
    installedSecondHandler?.({ action: 'play' });
    expect(secondHandler).toHaveBeenCalledOnce();

    second.destroy!();
    expect(session.handlers.get('play')).toBeNull();
  });

  it('preserves metadata synchronously republished while an older backend releases it', () => {
    const session = installFakeMediaSession();
    const first = createWebMediaSessionBackend();
    const second = createWebMediaSessionBackend();
    let currentMetadata: unknown;
    let republish = true;
    Object.defineProperty(session, 'metadata', {
      configurable: true,
      get: () => currentMetadata,
      set(value: unknown) {
        currentMetadata = value;
        if (value === null && republish) {
          republish = false;
          second.setMetadata!({ title: 'Second', artist: 'Artist', album: 'Album', artwork: [] });
        }
      },
    });
    first.setMetadata!({ title: 'First', artist: 'Artist', album: 'Album', artwork: [] });

    first.destroy!();

    expect(currentMetadata).toMatchObject({ title: 'Second' });
    second.destroy!();
    expect(currentMetadata).toBeNull();
  });

  it('preserves playback synchronously republished while an older backend releases it', () => {
    const session = installFakeMediaSession();
    const first = createWebMediaSessionBackend();
    const second = createWebMediaSessionBackend();
    let currentPlaybackState = 'none';
    let republish = true;
    Object.defineProperty(session, 'playbackState', {
      configurable: true,
      get: () => currentPlaybackState,
      set(value: string) {
        currentPlaybackState = value;
        if (value === 'none' && republish) {
          republish = false;
          second.setPlaybackState!('paused');
        }
      },
    });
    first.setPlaybackState!('playing');

    first.destroy!();

    expect(currentPlaybackState).toBe('paused');
    second.destroy!();
    expect(currentPlaybackState).toBe('none');
  });

  it('preserves position synchronously republished while an older backend releases it', () => {
    const session = installFakeMediaSession();
    const first = createWebMediaSessionBackend();
    const second = createWebMediaSessionBackend();
    const setPositionState = session.setPositionState!.bind(session);
    const secondPosition = { duration: 200, playbackRate: 1, position: 20 };
    let republish = true;
    session.setPositionState = (state) => {
      setPositionState(state);
      if (state === undefined && republish) {
        republish = false;
        second.setPositionState!(secondPosition);
      }
    };
    first.setPositionState!({ duration: 100, playbackRate: 1, position: 10 });

    first.destroy!();

    expect(session.positionState).toBe(secondPosition);
    second.destroy!();
    expect(session.positionState).toBeUndefined();
  });

  it('drains replacement ownership and publication records created synchronously during destroy', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    const clearer = createWebMediaSessionBackend();
    let currentMetadata: unknown;
    let republish = true;
    Object.defineProperty(session, 'metadata', {
      configurable: true,
      get: () => currentMetadata,
      set(value: unknown) {
        currentMetadata = value;
        if (value === null && republish) {
          republish = false;
          clearer.setMetadata!(null);
          backend.destroy!();
          backend.setMetadata!({ title: 'Reentrant', artist: 'Artist', album: 'Album', artwork: [] });
        }
      },
    });
    backend.setMetadata!({ title: 'First', artist: 'Artist', album: 'Album', artwork: [] });

    backend.destroy!();

    expect(currentMetadata).toBeNull();
  });

  it('releases the exact session identity it touched without clearing the current navigator session', () => {
    const firstSession = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    publishAllMediaSessionLanes(backend, 'Owned', () => undefined);

    const currentSession = installFakeMediaSession();
    const currentMetadata = { title: 'Current' };
    const currentPosition = { duration: 60, playbackRate: 1, position: 12 };
    const currentHandler = vi.fn();
    currentSession.metadata = currentMetadata;
    currentSession.playbackState = 'paused';
    currentSession.positionState = currentPosition;
    currentSession.handlers.set('play', currentHandler);

    backend.destroy!();

    expect(firstSession.metadata).toBeNull();
    expect(firstSession.playbackState).toBe('none');
    expect(firstSession.positionState).toBeUndefined();
    expect(firstSession.handlers.get('play')).toBeNull();
    expect(currentSession.metadata).toBe(currentMetadata);
    expect(currentSession.playbackState).toBe('paused');
    expect(currentSession.positionState).toBe(currentPosition);
    expect(currentSession.positionCalls).toEqual([]);
    expect(currentSession.handlers.get('play')).toBe(currentHandler);
  });

  it('preserves readable lanes replaced directly outside Flight', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setMetadata!({ title: 'Owned', artist: 'Artist', album: 'Album', artwork: [] });
    backend.setPlaybackState!('playing');
    const foreignMetadata = { title: 'Foreign' };
    session.metadata = foreignMetadata;
    session.playbackState = 'paused';

    backend.destroy!();

    expect(session.metadata).toBe(foreignMetadata);
    expect(session.playbackState).toBe('paused');
  });

  it('keeps foreign and superseding action handlers out of an older backend roster', () => {
    const session = installFakeMediaSession();
    const first = createWebMediaSessionBackend();
    const second = createWebMediaSessionBackend();
    const foreignPauseHandler = vi.fn();
    const secondPlayHandler = vi.fn();
    session.handlers.set('pause', foreignPauseHandler);
    first.setActionHandler!('play', () => undefined);
    second.setActionHandler!('play', secondPlayHandler);
    const registeredSecondHandler = session.handlers.get('play');

    first.destroy!();

    expect(session.handlers.get('pause')).toBe(foreignPauseHandler);
    expect(session.handlers.get('play')).toBe(registeredSecondHandler);
  });

  it('retries failed lane releases and does no work after every release succeeds', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    publishAllMediaSessionLanes(backend, 'Owned', () => undefined);

    let metadataValue = session.metadata;
    let playbackStateValue = session.playbackState;
    let metadataClearAttempts = 0;
    let playbackStateClearAttempts = 0;
    let positionClearAttempts = 0;
    let actionClearAttempts = 0;
    Object.defineProperty(session, 'metadata', {
      configurable: true,
      get: () => metadataValue,
      set: (value: unknown) => {
        if (value === null && metadataClearAttempts++ === 0) throw new Error('metadata clear failed');
        metadataValue = value;
      },
    });
    Object.defineProperty(session, 'playbackState', {
      configurable: true,
      get: () => playbackStateValue,
      set: (value: string) => {
        if (value === 'none' && playbackStateClearAttempts++ === 0) throw new Error('playback clear failed');
        playbackStateValue = value;
      },
    });
    const setPositionState = session.setPositionState!.bind(session);
    session.setPositionState = (state?: unknown) => {
      if (state === undefined && positionClearAttempts++ === 0) throw new Error('position clear failed');
      setPositionState(state);
    };
    const setActionHandler = session.setActionHandler.bind(session);
    session.setActionHandler = (action, handler) => {
      if (action === 'play' && handler === null && actionClearAttempts++ === 0) {
        throw new Error('action clear failed');
      }
      setActionHandler(action, handler);
    };

    expect(() => backend.destroy!()).not.toThrow();
    expect(metadataValue).not.toBeNull();
    expect(playbackStateValue).toBe('playing');
    expect(session.positionState).not.toBeUndefined();
    expect(session.handlers.get('play')).toBeTypeOf('function');
    expect([metadataClearAttempts, playbackStateClearAttempts, positionClearAttempts, actionClearAttempts]).toEqual([
      1, 1, 1, 1,
    ]);

    backend.destroy!();
    expect(metadataValue).toBeNull();
    expect(playbackStateValue).toBe('none');
    expect(session.positionState).toBeUndefined();
    expect(session.handlers.get('play')).toBeNull();
    expect([metadataClearAttempts, playbackStateClearAttempts, positionClearAttempts, actionClearAttempts]).toEqual([
      2, 2, 2, 2,
    ]);

    backend.destroy!();
    expect([metadataClearAttempts, playbackStateClearAttempts, positionClearAttempts, actionClearAttempts]).toEqual([
      2, 2, 2, 2,
    ]);
  });

  it('retains position ownership until a temporarily missing release method returns', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    const position = { duration: 100, playbackRate: 1, position: 10 };
    backend.setPositionState!(position);
    const setPositionState = session.setPositionState;
    delete session.setPositionState;

    backend.destroy!();
    expect(session.positionState).toBe(position);

    session.setPositionState = setPositionState;
    backend.destroy!();
    expect(session.positionState).toBeUndefined();
  });
});

// Whole-backend teardown. What this frees is state INSTALLED into navigator.mediaSession — metadata, the
// playback state, the scrubber and the action callbacks — none of which the backend holds a reference to.
describe('destroyMediaSessionBackend', () => {
  afterEach(() => resetMediaSessionBackendForTest());

  it('destroys the installed backend and clears the slot', () => {
    const destroyed: string[] = [];
    setMediaSessionBackend({ destroy: () => destroyed.push('only'), setMetadata: () => undefined });
    destroyMediaSessionBackend();
    expect(destroyed).toEqual(['only']);
    expect(hasMediaSessionOperation('setMetadata')).toBe(false);
  });

  // Exactly-once falls out of clearing the slot, not a flag that could drift from it.
  it('destroys exactly once across repeated teardown', () => {
    const destroyed: string[] = [];
    setMediaSessionBackend({ destroy: () => destroyed.push('only') });
    destroyMediaSessionBackend();
    destroyMediaSessionBackend();
    expect(destroyed).toEqual(['only']);
  });

  it('is safe with nothing installed', () => {
    resetMediaSessionBackendForTest();
    expect(() => destroyMediaSessionBackend()).not.toThrow();
  });
});

describe('explainMediaSessionBackend', () => {
  afterEach(() => resetMediaSessionBackendForTest());

  it('starts a fresh module without a host conflict before any competing install', async () => {
    vi.resetModules();
    const freshMediaSession = await import('./mediasession');
    try {
      freshMediaSession.installMediaSessionHostBackend({});
      expect(freshMediaSession.explainMediaSessionBackend()).toMatchObject({ conflict: false, layer: 'host' });
    } finally {
      freshMediaSession.resetMediaSessionBackendForTest();
    }
  });

  it('reports host-not-enabled when no backend is installed', () => {
    resetMediaSessionBackendForTest();
    const explanation = explainMediaSessionBackend();
    expect(explanation.layer).toBe('host-not-enabled');
    expect(explanation.conflict).toBe(false);
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when a custom backend is set', () => {
    setMediaSessionBackend(getMediaSessionBackend());
    expect(explainMediaSessionBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installMediaSessionHostBackend(getMediaSessionBackend());
    expect(explainMediaSessionBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installMediaSessionHostBackend({ ...getMediaSessionBackend() });
    installMediaSessionHostBackend({ ...getMediaSessionBackend() });
    expect(explainMediaSessionBackend().conflict).toBe(true);
  });
});

// Per-operation availability. Every operation on this backend is optional and the fall-through implements
// none of them, so `has*` is the only way a caller can tell an unsupported transport control from a
// supported one that happens to be idle.
describe('explainMediaSessionOperation', () => {
  afterEach(() => resetMediaSessionBackendForTest());

  const OPERATIONS: readonly MediaSessionOperation[] = [
    'setActionHandler',
    'setMetadata',
    'setPlaybackState',
    'setPositionState',
  ];

  // ★ Every operation, not a sample: this interface is fully B-class, so if the fall-through could
  // masquerade for any one of the four it would masquerade for all of them.
  it('reports every operation unimplemented when nothing is installed', () => {
    resetMediaSessionBackendForTest();
    for (const operation of OPERATIONS) {
      expect(explainMediaSessionOperation(operation)).toEqual({
        implemented: false,
        layer: 'sentinel',
        operation,
      });
    }
  });

  it('reports only the operations a partial host actually provides', () => {
    setMediaSessionBackend({ setMetadata: () => undefined });
    expect(hasMediaSessionOperation('setMetadata')).toBe(true);
    expect(hasMediaSessionOperation('setPlaybackState')).toBe(false);
    expect(hasMediaSessionOperation('setActionHandler')).toBe(false);
    expect(hasMediaSessionOperation('setPositionState')).toBe(false);
  });

  it('falls through to the host for an operation the custom backend omits', () => {
    installMediaSessionHostBackend({ setPositionState: () => undefined });
    setMediaSessionBackend({ setMetadata: () => undefined });
    expect(explainMediaSessionOperation('setPositionState')).toEqual({
      implemented: true,
      layer: 'host',
      operation: 'setPositionState',
    });
    expect(explainMediaSessionOperation('setMetadata').layer).toBe('custom');
  });

  // The public API must stay callable with nothing installed — absence no-ops through `?.` rather than
  // throwing, which is what lets a caller ignore the query when it does not care.
  it('leaves the public operations safe to call with nothing installed', () => {
    resetMediaSessionBackendForTest();
    expect(() => setMediaSessionPlaybackState('playing')).not.toThrow();
    expect(() => clearMediaSessionMetadata()).not.toThrow();
  });
});

describe('getMediaSessionBackend', () => {
  // ★ The fall-through implements NOTHING, and that is the correction. It used to answer all four
  // operations with no-ops a caller could not tell from a real implementation; now absence is absence.
  it('falls through to a backend that implements no operation when none is set', () => {
    const backend = getMediaSessionBackend();
    expect(backend).toBeTypeOf('object');
    expect(backend.setMetadata).toBeUndefined();
    expect(hasMediaSessionOperation('setMetadata')).toBe(false);
  });

  it('returns the same lazily-created backend on repeat calls', () => {
    expect(getMediaSessionBackend()).toBe(getMediaSessionBackend());
  });

  it('returns an installed backend', () => {
    const fake = createFakeBackend();
    setMediaSessionBackend(fake);
    expect(getMediaSessionBackend()).toBe(fake);
  });
});

describe('hasMediaSessionHostBackend', () => {
  // Reports the SLOT rather than the effective backend. A host package uses this instead of caching
  // "did I install", so that clearing the slot is immediately visible to it.
  it('is false before a host backend is installed and true after', () => {
    resetMediaSessionBackendForTest();
    expect(hasMediaSessionHostBackend()).toBe(false);
    installMediaSessionHostBackend(createFakeBackend());
    expect(hasMediaSessionHostBackend()).toBe(true);
  });

  // ★ A CUSTOM BACKEND MUST NOT SUPPRESS HOST INSTALLATION. Custom outranks host for callers, but it
  // occupies a different slot; reporting it here would make a host package skip installing and leave
  // the host slot permanently empty once the custom one is cleared.
  it('stays false when only a custom backend is set', () => {
    resetMediaSessionBackendForTest();
    setMediaSessionBackend(createFakeBackend());
    expect(hasMediaSessionHostBackend()).toBe(false);
    resetMediaSessionBackendForTest();
  });
});

describe('hasMediaSessionOperation', () => {
  afterEach(() => resetMediaSessionBackendForTest());

  it('agrees with explainMediaSessionOperation', () => {
    setMediaSessionBackend({ setMetadata: () => undefined });
    for (const operation of ['setMetadata', 'setPlaybackState'] as const) {
      expect(hasMediaSessionOperation(operation)).toBe(explainMediaSessionOperation(operation).implemented);
    }
  });
});

describe('installMediaSessionHostBackend', () => {
  afterEach(() => resetMediaSessionBackendForTest());

  it('installs a host backend that getMediaSessionBackend returns', () => {
    const backend = getMediaSessionBackend();
    installMediaSessionHostBackend(backend);
    expect(getMediaSessionBackend()).toBe(backend);
  });

  it('is first-host-wins: a second different backend sets conflict', () => {
    const first = { ...getMediaSessionBackend() };
    const second = { ...getMediaSessionBackend() };
    installMediaSessionHostBackend(first);
    installMediaSessionHostBackend(second);
    expect(getMediaSessionBackend()).toBe(first);
    expect(explainMediaSessionBackend().conflict).toBe(true);
  });
});

// ★ LAYERED OWNERSHIP. The same object can occupy the custom and host slots at once, and a slot losing a
// reference is not the same as the object losing its last one. Each case here is a way a naive
// `_custom ?? _host` teardown gets it wrong.
describe('layered custom and host ownership', () => {
  afterEach(() => resetMediaSessionBackendForTest());

  // SHADOWED: installing a custom over a live host hides the host; it does not free it. The host slot
  // still owns it and revealing it later must give back a working backend.
  it('does not destroy a host that a custom merely shadows, nor when it is revealed again', () => {
    const destroyed: string[] = [];
    const host = { destroy: () => destroyed.push('host'), setMetadata: () => undefined };
    installMediaSessionHostBackend(host);
    setMediaSessionBackend({ destroy: () => destroyed.push('custom') });
    expect(destroyed).toEqual([]);

    setMediaSessionBackend(null);
    expect(destroyed).toEqual(['custom']);
    expect(getMediaSessionBackend()).toBe(host);
  });

  // ALIASED: one object in both slots. Clearing custom must NOT destroy it — the host slot still owns it,
  // and destroying here would tear down state the host is still serving.
  it('does not destroy an aliased backend while the other slot still references it', () => {
    const destroyed: string[] = [];
    const shared = { destroy: () => destroyed.push('shared'), setMetadata: () => undefined };
    installMediaSessionHostBackend(shared);
    setMediaSessionBackend(shared);

    setMediaSessionBackend(null);
    expect(destroyed).toEqual([]);
    expect(getMediaSessionBackend()).toBe(shared);
  });

  // ALIASED, FINAL REMOVAL: when the last slot lets go, it is destroyed once — not twice for two slots.
  it('destroys an aliased backend exactly once when the final slot releases it', () => {
    const destroyed: string[] = [];
    const shared = { destroy: () => destroyed.push('shared') };
    installMediaSessionHostBackend(shared);
    setMediaSessionBackend(shared);

    destroyMediaSessionBackend();
    expect(destroyed).toEqual(['shared']);
  });

  // DISTINCT: two different objects, two slots, both must be destroyed — a `??` chain frees only one.
  it('destroys distinct custom and host backends once each', () => {
    const destroyed: string[] = [];
    installMediaSessionHostBackend({ destroy: () => destroyed.push('host') });
    setMediaSessionBackend({ destroy: () => destroyed.push('custom') });

    destroyMediaSessionBackend();
    expect(destroyed.sort()).toEqual(['custom', 'host']);
  });
});

describe('observeMediaSessionHostResult', () => {
  afterEach(() => resetMediaSessionBackendForTest());

  it('records a successful observation', () => {
    installMediaSessionHostBackend(getMediaSessionBackend());
    observeMediaSessionHostResult('setActionHandler', true);
    const explanation = explainMediaSessionBackend();
    expect(explanation.operation).toBe('setActionHandler');
    expect(explanation.viability).toBe('available');
  });

  it('records a failed observation', () => {
    installMediaSessionHostBackend(getMediaSessionBackend());
    observeMediaSessionHostResult('setActionHandler', false);
    expect(explainMediaSessionBackend().viability).toBe('runtime-api-unavailable');
  });
});

describe('resetMediaSessionBackendForTest', () => {
  it('clears all backend slots', () => {
    setMediaSessionBackend(getMediaSessionBackend());
    installMediaSessionHostBackend(getMediaSessionBackend());
    observeMediaSessionHostResult('setActionHandler', true);
    resetMediaSessionBackendForTest();
    expect(explainMediaSessionBackend().layer).toBe('host-not-enabled');
    expect(explainMediaSessionBackend().conflict).toBe(false);
    expect(explainMediaSessionBackend().viability).toBe('unobserved');
  });

  it('clears a prior conflict before a fresh host install', () => {
    const first = {};
    installMediaSessionHostBackend(first);
    installMediaSessionHostBackend({});
    expect(explainMediaSessionBackend().conflict).toBe(true);

    resetMediaSessionBackendForTest();
    installMediaSessionHostBackend(first);
    try {
      expect(explainMediaSessionBackend().conflict).toBe(false);
    } finally {
      resetMediaSessionBackendForTest();
    }
  });
});

describe('setMediaSessionActionHandler', () => {
  it('routes the handler through the active backend', () => {
    const fake = createFakeBackend();
    setMediaSessionBackend(fake);
    const handler = () => {};
    setMediaSessionActionHandler('nexttrack', handler);
    expect(fake.calls).toEqual(['setActionHandler']);
    expect(fake.args[0]).toEqual(['nexttrack', handler]);
  });
});

describe('setMediaSessionBackend', () => {
  it('installs a backend, and null restores the implements-nothing fall-through', () => {
    const fake = createFakeBackend();
    setMediaSessionBackend(fake);
    expect(getMediaSessionBackend()).toBe(fake);
    setMediaSessionBackend(null);
    const restored = getMediaSessionBackend();
    expect(restored).not.toBe(fake);
    expect(restored.setMetadata).toBeUndefined();
  });
});

describe('setMediaSessionBackend replacement lifetime', () => {
  afterEach(() => resetMediaSessionBackendForTest());

  it('destroys the outgoing backend when a new one replaces it', () => {
    const destroyed: string[] = [];
    const first = { destroy: () => destroyed.push('first') };
    const second = { destroy: () => destroyed.push('second') };
    setMediaSessionBackend(first);
    setMediaSessionBackend(second);
    expect(destroyed).toEqual(['first']);
    expect(getMediaSessionBackend()).toBe(second);
  });

  it('destroys the outgoing backend when removed with null', () => {
    const destroyed: string[] = [];
    setMediaSessionBackend({ destroy: () => destroyed.push('only') });
    setMediaSessionBackend(null);
    expect(destroyed).toEqual(['only']);
  });

  // Re-installing the SAME object must not tear down live OS state the caller never removed.
  it('does not destroy when the same backend is installed again', () => {
    const destroyed: string[] = [];
    const only = { destroy: () => destroyed.push('only') };
    setMediaSessionBackend(only);
    setMediaSessionBackend(only);
    expect(destroyed).toEqual([]);
  });
});

describe('setMediaSessionMetadata', () => {
  it('routes the metadata through the active backend', () => {
    const fake = createFakeBackend();
    setMediaSessionBackend(fake);
    const metadata = { title: 'A', artist: 'B', album: 'C', artwork: [] };
    setMediaSessionMetadata(metadata);
    expect(fake.calls).toEqual(['setMetadata']);
    expect(fake.args[0]).toEqual([metadata]);
  });
});

describe('setMediaSessionPlaybackState', () => {
  it('routes the playback state through the active backend', () => {
    const fake = createFakeBackend();
    setMediaSessionBackend(fake);
    setMediaSessionPlaybackState('playing');
    expect(fake.calls).toEqual(['setPlaybackState']);
    expect(fake.args[0]).toEqual(['playing']);
  });
});

describe('setMediaSessionPositionState', () => {
  it('routes the position state through the active backend', () => {
    const fake = createFakeBackend();
    setMediaSessionBackend(fake);
    const state = { duration: 200, playbackRate: 1, position: 50 };
    setMediaSessionPositionState(state);
    expect(fake.calls).toEqual(['setPositionState']);
    expect(fake.args[0]).toEqual([state]);
  });
});
