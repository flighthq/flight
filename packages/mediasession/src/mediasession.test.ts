import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { connectSignal, hasSignalSlots } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  HostMediaSessionActionProvider,
  MediaSessionActionDetails,
  HostMediaSessionProvider,
  MediaSessionPositionState,
} from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  attachMediaSessionAction,
  clearMediaSessionMetadata,
  clearMediaSessionPositionState,
  createMediaSessionActionSignal,
  destroyMediaSession,
  detachMediaSessionAction,
  disposeMediaSessionActionSignal,
  initializeMediaSessionActionSignal,
  setMediaSessionMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
} from './mediasession';

function commandBackend(overrides: Partial<HostMediaSessionProvider> = {}): HostMediaSessionProvider {
  const out = allocateEntity<HostMediaSessionProvider>();
  out.clearMetadata = () => ({ reason: 'ok' as const });
  out.clearPositionState = () => ({ reason: 'ok' as const });
  out.destroy = () => {};
  out.setMetadata = () => ({ reason: 'ok' as const });
  out.setPlaybackState = () => ({ reason: 'ok' as const });
  out.setPositionState = () => ({ reason: 'ok' as const });
  Object.assign(out, overrides);
  return finishEntity(out);
}

function actionBackend(overrides: Partial<HostMediaSessionActionProvider> = {}): HostMediaSessionActionProvider {
  const out = allocateEntity<HostMediaSessionActionProvider>();
  out.destroy = () => {};
  out.subscribe = () => () => {};
  Object.assign(out, overrides);
  return finishEntity(out);
}

function host(commands = commandBackend(), actions = actionBackend()) {
  return { media: { session: commands, sessionAction: actions } };
}

describe('attachMediaSessionAction', () => {
  it('attaches only its action and forwards provider details', () => {
    let listener: ((details: Readonly<MediaSessionActionDetails>) => void) | undefined;
    const subscribe = vi.fn((action, next) => {
      expect(action).toBe('seekto');
      listener = next;
      return () => {};
    });
    const signal = createMediaSessionActionSignal('seekto');
    const observed = vi.fn();
    connectSignal(signal.onAction, observed);
    expect(
      attachMediaSessionAction(host(commandBackend(), actionBackend({ subscribe })).media.sessionAction, signal),
    ).toBe(true);
    listener?.({ action: 'seekto', seekTime: 8, fastSeek: true });
    expect(observed).toHaveBeenCalledWith({ action: 'seekto', seekTime: 8, fastSeek: true });
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it('reports a null provider subscription as a detached runtime refusal', () => {
    const signal = createMediaSessionActionSignal('play');
    expect(
      attachMediaSessionAction(
        host(commandBackend(), actionBackend({ subscribe: () => null })).media.sessionAction,
        signal,
      ),
    ).toBe(false);
    expect(() => detachMediaSessionAction(signal)).not.toThrow();
  });

  it('reattaching releases the prior origin before subscribing the replacement', () => {
    const order: string[] = [];
    const signal = createMediaSessionActionSignal('play');
    attachMediaSessionAction(
      host(commandBackend(), actionBackend({ subscribe: () => () => order.push('detach-first') })).media.sessionAction,
      signal,
    );
    attachMediaSessionAction(
      host(
        commandBackend(),
        actionBackend({
          subscribe: () => {
            order.push('attach-second');
            return () => {};
          },
        }),
      ).media.sessionAction,
      signal,
    );
    expect(order).toEqual(['detach-first', 'attach-second']);
  });
});

describe('clearMediaSessionMetadata', () => {
  it('returns the explicit Host provider outcome', () => {
    const clearMetadata = vi.fn(() => ({ reason: 'operation-failed' as const }));
    expect(clearMediaSessionMetadata(host(commandBackend({ clearMetadata })).media.session)).toEqual({
      reason: 'operation-failed',
    });
  });
});

describe('clearMediaSessionPositionState', () => {
  it('returns the explicit Host provider outcome', () => {
    const clearPositionState = vi.fn(() => ({ reason: 'position-state-unavailable' as const }));
    expect(clearMediaSessionPositionState(host(commandBackend({ clearPositionState })).media.session)).toEqual({
      reason: 'position-state-unavailable',
    });
  });
});

describe('createMediaSessionActionSignal', () => {
  it('creates one Entity carrying exactly the requested action and one signal', () => {
    const signal = createMediaSessionActionSignal('seekto');
    expect(EntityRuntimeKey in signal).toBe(true);
    expect(signal.action).toBe('seekto');
    expect(signal.onAction).toBeDefined();
  });
});

describe('destroyMediaSession', () => {
  it('destroys distinct command and event providers once each', () => {
    const order: string[] = [];
    destroyMediaSession(
      host(
        commandBackend({ destroy: () => order.push('commands') }),
        actionBackend({ destroy: () => order.push('actions') }),
      ).media.session,
      host(
        commandBackend({ destroy: () => order.push('commands') }),
        actionBackend({ destroy: () => order.push('actions') }),
      ).media.sessionAction,
    );
    expect(order).toEqual(['commands', 'actions']);
  });

  it('deduplicates an aliased provider identity across both Host slots', () => {
    const destroy = vi.fn();
    const _shared = allocateEntity<HostMediaSessionProvider & HostMediaSessionActionProvider>();
    _shared.clearMetadata = () => ({ reason: 'ok' as const });
    _shared.clearPositionState = () => ({ reason: 'ok' as const });
    _shared.destroy = destroy;
    _shared.setMetadata = () => ({ reason: 'ok' as const });
    _shared.setPlaybackState = () => ({ reason: 'ok' as const });
    _shared.setPositionState = () => ({ reason: 'ok' as const });
    _shared.subscribe = () => () => {};
    const shared = finishEntity(_shared);
    destroyMediaSession(host(shared, shared).media.session, host(shared, shared).media.sessionAction);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('attempts a distinct sibling after the first provider throws, then rethrows', () => {
    const actions = vi.fn();
    expect(() =>
      destroyMediaSession(
        host(
          commandBackend({
            destroy: () => {
              throw new Error('commands failed');
            },
          }),
          actionBackend({ destroy: actions }),
        ).media.session,
        host(
          commandBackend({
            destroy: () => {
              throw new Error('commands failed');
            },
          }),
          actionBackend({ destroy: actions }),
        ).media.sessionAction,
      ),
    ).toThrow('commands failed');
    expect(actions).toHaveBeenCalledOnce();
  });

  it('preserves even an undefined thrown value after attempting the sibling', () => {
    const actions = vi.fn();
    let caught = false;
    try {
      destroyMediaSession(
        host(
          commandBackend({
            destroy: () => {
              throw undefined;
            },
          }),
          actionBackend({ destroy: actions }),
        ).media.session,
        host(
          commandBackend({
            destroy: () => {
              throw undefined;
            },
          }),
          actionBackend({ destroy: actions }),
        ).media.sessionAction,
      );
    } catch (error) {
      caught = true;
      expect(error).toBeUndefined();
    }
    expect(caught).toBe(true);
    expect(actions).toHaveBeenCalledOnce();
  });
});

describe('detachMediaSessionAction', () => {
  it('origin-pins the exact unsubscribe across later Host changes', () => {
    const first = vi.fn();
    const second = vi.fn();
    const signal = createMediaSessionActionSignal('play');
    attachMediaSessionAction(
      host(commandBackend(), actionBackend({ subscribe: () => first })).media.sessionAction,
      signal,
    );
    const replacement = host(commandBackend(), actionBackend({ subscribe: () => second }));
    void replacement;
    detachMediaSessionAction(signal);
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it('keeps a throwing unsubscribe retryable', () => {
    let attempts = 0;
    const unsubscribe = vi.fn(() => {
      if (attempts++ === 0) throw new Error('temporary clear failure');
    });
    const signal = createMediaSessionActionSignal('pause');
    attachMediaSessionAction(
      host(commandBackend(), actionBackend({ subscribe: () => unsubscribe })).media.sessionAction,
      signal,
    );
    expect(() => detachMediaSessionAction(signal)).toThrow('temporary clear failure');
    expect(() => detachMediaSessionAction(signal)).not.toThrow();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    detachMediaSessionAction(signal);
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });
});

describe('disposeMediaSessionActionSignal', () => {
  it('dispose clears the signal even when detach fails, while retaining detach retry', () => {
    let attempts = 0;
    const signal = createMediaSessionActionSignal('stop');
    connectSignal(signal.onAction, vi.fn());
    attachMediaSessionAction(
      host(
        commandBackend(),
        actionBackend({
          subscribe: () => () => {
            if (attempts++ === 0) throw new Error('retry me');
          },
        }),
      ).media.sessionAction,
      signal,
    );
    expect(() => disposeMediaSessionActionSignal(signal)).toThrow('retry me');
    expect(hasSignalSlots(signal.onAction)).toBe(false);
    expect(() => disposeMediaSessionActionSignal(signal)).not.toThrow();
  });
});

describe('initializeMediaSessionActionSignal', () => {
  it('is the construction initializer of createMediaSessionActionSignal', () => {
    expect(typeof initializeMediaSessionActionSignal).toBe('function');
  });
});

describe('setMediaSessionMetadata', () => {
  it('passes metadata to the explicit Host provider and returns its exact outcome', () => {
    const metadata = { title: 'A', artist: 'B', album: 'C', artwork: [] };
    const setMetadata = vi.fn(() => ({ reason: 'media-metadata-unavailable' as const }));
    expect(setMediaSessionMetadata(host(commandBackend({ setMetadata })).media.session, metadata)).toEqual({
      reason: 'media-metadata-unavailable',
    });
    expect(setMetadata).toHaveBeenCalledWith(metadata);
  });
});

describe('setMediaSessionPlaybackState', () => {
  it('returns the explicit Host provider outcome', () => {
    const setPlaybackState = vi.fn(() => ({ reason: 'media-session-unavailable' as const }));
    expect(setMediaSessionPlaybackState(host(commandBackend({ setPlaybackState })).media.session, 'playing')).toEqual({
      reason: 'media-session-unavailable',
    });
  });

  it('throws TypeError for an out-of-union playback state before provider invocation', () => {
    const setPlaybackState = vi.fn(() => ({ reason: 'ok' as const }));
    const explicit = host(commandBackend({ setPlaybackState }));
    expect(() => setMediaSessionPlaybackState(explicit.media.session, 'buffering' as never)).toThrow(TypeError);
    expect(setPlaybackState).not.toHaveBeenCalled();
  });
});
describe('setMediaSessionPositionState', () => {
  it('passes a valid position to the explicit Host provider and returns its exact outcome', () => {
    const position = { duration: 20, playbackRate: 1, position: 4 };
    const setPositionState = vi.fn(() => ({ reason: 'operation-failed' as const }));
    expect(setMediaSessionPositionState(host(commandBackend({ setPositionState })).media.session, position)).toEqual({
      reason: 'operation-failed',
    });
    expect(setPositionState).toHaveBeenCalledWith(position);
  });

  it.each([
    [{ duration: 0, playbackRate: 1, position: 0 }, 'invalid-duration'],
    [{ duration: -1, playbackRate: 1, position: 0 }, 'invalid-duration'],
    [{ duration: Number.POSITIVE_INFINITY, playbackRate: 1, position: 0 }, 'invalid-duration'],
    [{ duration: 10, playbackRate: 1, position: -1 }, 'invalid-position'],
    [{ duration: 10, playbackRate: 1, position: 11 }, 'invalid-position'],
    [{ duration: 10, playbackRate: 1, position: Number.NaN }, 'invalid-position'],
    [{ duration: 10, playbackRate: 0, position: 1 }, 'invalid-playback-rate'],
    [{ duration: 10, playbackRate: Number.NaN, position: 1 }, 'invalid-playback-rate'],
  ] as const)('classifies invalid position input locally: %o', (position, reason) => {
    const setPositionState = vi.fn(() => ({ reason: 'ok' as const }));
    expect(setMediaSessionPositionState(host(commandBackend({ setPositionState })).media.session, position)).toEqual({
      reason,
    });
    expect(setPositionState).not.toHaveBeenCalled();
  });

  it('accepts finite negative playback rates but not zero, matching the platform algorithm', () => {
    const setPositionState = vi.fn(() => ({ reason: 'ok' as const }));
    const position: MediaSessionPositionState = { duration: 10, playbackRate: -1, position: 1 };
    expect(setMediaSessionPositionState(host(commandBackend({ setPositionState })).media.session, position)).toEqual({
      reason: 'ok',
    });
    expect(setPositionState).toHaveBeenCalledOnce();
  });
});
