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

  // ★ The action handlers are the dangerous part: a callback left registered keeps the OS transport
  // buttons calling into a backend that has been replaced. Destroy must clear exactly the actions THIS
  // instance registered.
  it('clears the action handlers it registered, and the published card', () => {
    const cleared: (string | null)[] = [];
    const session = {
      metadata: {} as unknown,
      playbackState: 'playing',
      setActionHandler: (action: string, handler: unknown) => {
        if (handler === null) cleared.push(action);
      },
      setPositionState: () => undefined,
    };
    vi.stubGlobal('navigator', { mediaSession: session });

    const backend = createWebMediaSessionBackend();
    backend.setActionHandler!('play', () => undefined);
    backend.setActionHandler!('pause', () => undefined);
    backend.destroy!();

    expect(cleared.sort()).toEqual(['pause', 'play']);
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
    vi.unstubAllGlobals();
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
