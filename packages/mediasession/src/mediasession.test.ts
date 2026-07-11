import type { MediaSessionActionDetails, MediaSessionBackend } from '@flighthq/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearMediaSessionActionHandler,
  clearMediaSessionMetadata,
  clearMediaSessionPositionState,
  createWebMediaSessionBackend,
  getMediaSessionBackend,
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
    handlers: new Map(),
    setPositionState(state?: unknown) {
      this.positionCalls.push(state);
    },
    setActionHandler(action, handler) {
      if (action === unsupportedAction) throw new Error('unsupported action');
      this.handlers.set(action, handler);
    },
  };
  Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true });
  return session;
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
    clearMediaSessionPositionState();
    expect(session.positionCalls).toEqual([undefined]);
  });
});

describe('createWebMediaSessionBackend', () => {
  it('sets metadata via a MediaMetadata instance', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setMetadata({ title: 'Song', artist: 'Artist', album: 'Album', artwork: [{ src: 'a.png' }] });
    expect(session.metadata).toBeInstanceOf(FakeMediaMetadata);
    expect((session.metadata as FakeMediaMetadata).title).toBe('Song');
    expect((session.metadata as FakeMediaMetadata).artwork).toEqual([{ src: 'a.png' }]);
  });

  it('does not construct MediaMetadata when it is absent', () => {
    const session = installFakeMediaSession();
    delete (globalThis as { MediaMetadata?: unknown }).MediaMetadata;
    const backend = createWebMediaSessionBackend();
    session.metadata = 'unchanged';
    backend.setMetadata({ title: 'Song', artist: 'Artist', album: 'Album', artwork: [] });
    expect(session.metadata).toBe('unchanged');
  });

  it('assigns the playback state', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setPlaybackState('playing');
    expect(session.playbackState).toBe('playing');
  });

  it('forwards the position state to setPositionState', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    backend.setPositionState({ duration: 100, playbackRate: 1, position: 10 });
    expect(session.positionCalls).toEqual([{ duration: 100, playbackRate: 1, position: 10 }]);
  });

  it('no-ops setPositionState when the method is absent', () => {
    const session = installFakeMediaSession();
    delete session.setPositionState;
    const backend = createWebMediaSessionBackend();
    expect(() => backend.setPositionState({ duration: 1, playbackRate: 1, position: 0 })).not.toThrow();
  });

  it('registers an action handler and maps fired details to the caller', () => {
    const session = installFakeMediaSession();
    const backend = createWebMediaSessionBackend();
    const handler = vi.fn();
    backend.setActionHandler('seekto', handler);
    const registered = session.handlers.get('seekto');
    expect(registered).toBeTypeOf('function');
    registered?.({ action: 'seekto', seekTime: 42, fastSeek: true });
    expect(handler).toHaveBeenCalledWith({ action: 'seekto', seekTime: 42, fastSeek: true });
  });

  it('swallows an unsupported-action throw from setActionHandler', () => {
    const session = installFakeMediaSession('skipad');
    const backend = createWebMediaSessionBackend();
    expect(() => backend.setActionHandler('skipad', () => {})).not.toThrow();
    expect(session.handlers.has('skipad')).toBe(false);
  });

  it('is a no-op in an environment without navigator.mediaSession', () => {
    removeMediaSession();
    const backend = createWebMediaSessionBackend();
    expect(() => {
      backend.setMetadata({ title: 'A', artist: 'B', album: 'C', artwork: [] });
      backend.setMetadata(null);
      backend.setPlaybackState('paused');
      backend.setPositionState({ duration: 1, playbackRate: 1, position: 0 });
      backend.setPositionState(null);
      backend.setActionHandler('play', () => {});
      backend.setActionHandler('play', null);
    }).not.toThrow();
  });
});

describe('getMediaSessionBackend', () => {
  it('lazily creates a web default backend when none is set', () => {
    const backend = getMediaSessionBackend();
    expect(backend).toBeTypeOf('object');
    expect(backend.setMetadata).toBeTypeOf('function');
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
  it('installs a backend and null restores the lazy web default', () => {
    const fake = createFakeBackend();
    setMediaSessionBackend(fake);
    expect(getMediaSessionBackend()).toBe(fake);
    setMediaSessionBackend(null);
    const restored = getMediaSessionBackend();
    expect(restored).not.toBe(fake);
    expect(restored.setMetadata).toBeTypeOf('function');
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
