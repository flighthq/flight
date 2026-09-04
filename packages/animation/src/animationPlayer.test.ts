import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createAnimationClip, createAnimationClipEvent } from './animationClip';
import {
  advanceAnimationPlayer,
  cloneAnimationPlayer,
  createAnimationPlayer,
  enableAnimationPlayerSignals,
  getAnimationPlayerNormalizedTime,
  initializeAnimationPlayer,
  playAnimationPlayer,
  seekAnimationPlayer,
  stopAnimationPlayer,
} from './animationPlayer';

function player(duration: number, opts?: Parameters<typeof createAnimationPlayer>[1]) {
  return createAnimationPlayer(createAnimationClip([], duration), opts);
}

function eventPlayer(duration: number, times: readonly number[], opts?: Parameters<typeof createAnimationPlayer>[1]) {
  return createAnimationPlayer(
    createAnimationClip(
      [],
      duration,
      times.map((time) => createAnimationClipEvent(time, String(time), time)),
    ),
    opts,
  );
}

describe('advanceAnimationPlayer', () => {
  it('advances the playhead by dt * speed', () => {
    const p = player(10, { loop: false, speed: 2 });
    advanceAnimationPlayer(p, 1);
    expect(p.time).toBe(2);
  });

  it('wraps modulo duration when looping', () => {
    const p = player(10, { loop: true, time: 9 });
    advanceAnimationPlayer(p, 3);
    expect(p.time).toBeCloseTo(2);
    expect(p.playing).toBe(true);
  });

  it('clamps and stops at the end when not looping', () => {
    const p = player(10, { loop: false, time: 9 });
    advanceAnimationPlayer(p, 5);
    expect(p.time).toBe(10);
    expect(p.playing).toBe(false);
  });

  it('is a no-op for a zero-duration clip', () => {
    const p = player(0, { time: 0 });
    advanceAnimationPlayer(p, 1);
    expect(p.time).toBe(0);
  });

  it('is a no-op while paused', () => {
    const p = player(10, { playing: false, time: 3 });
    advanceAnimationPlayer(p, 5);
    expect(p.time).toBe(3);
  });

  it('plays backward with negative speed', () => {
    const p = player(10, { speed: -1, time: 5 });
    advanceAnimationPlayer(p, 1);
    expect(p.time).toBeCloseTo(4);
  });

  it('stops at time 0 when playing backward without looping', () => {
    const p = player(10, { speed: -1, loop: false, time: 0.5 });
    advanceAnimationPlayer(p, 2);
    expect(p.time).toBe(0);
    expect(p.playing).toBe(false);
  });

  it('wraps backward when looping with negative speed', () => {
    // time=0.5, speed=-1, dt=2 -> raw=-1.5; -1.5 % 10 = -1.5; +10 = 8.5
    const p = player(10, { speed: -1, loop: true, time: 0.5 });
    advanceAnimationPlayer(p, 2);
    expect(p.time).toBeCloseTo(8.5);
    expect(p.playing).toBe(true);
  });

  it('reflects and reverses speed at the end in ping-pong mode', () => {
    const p = player(10, { loopMode: 'PingPong', speed: 1, time: 9 });
    advanceAnimationPlayer(p, 2); // raw = 11 -> reflect to 20 - 11 = 9, speed flips to -1
    expect(p.time).toBeCloseTo(9);
    expect(p.speed).toBe(-1);
    expect(p.playing).toBe(true);
  });

  it('reflects and reverses speed at the start in ping-pong mode', () => {
    const p = player(10, { loopMode: 'PingPong', speed: -1, time: 1 });
    advanceAnimationPlayer(p, 2); // raw = -1 -> reflect to 1, speed flips to +1
    expect(p.time).toBeCloseTo(1);
    expect(p.speed).toBe(1);
    expect(p.playing).toBe(true);
  });

  it('stops at the end when a finite repeat budget is exhausted', () => {
    const p = player(10, { loop: true, repeatCount: 0, time: 9 });
    advanceAnimationPlayer(p, 2); // no wrap permitted -> clamp to duration and stop
    expect(p.time).toBe(10);
    expect(p.playing).toBe(false);
  });

  it('spends one repeat per wrap and stops once the budget runs out', () => {
    const p = player(10, { loop: true, repeatCount: 1, time: 9 });
    advanceAnimationPlayer(p, 2); // first wrap allowed
    expect(p.time).toBeCloseTo(1);
    expect(p.playing).toBe(true);
    advanceAnimationPlayer(p, 10); // budget now exhausted -> stop
    expect(p.playing).toBe(false);
  });

  it('emits onLooped when looping wraps (signals enabled)', () => {
    const p = player(10, { loop: true, time: 9 });
    enableAnimationPlayerSignals(p);
    let looped = 0;
    connectSignal(p.onLooped!, () => looped++);
    advanceAnimationPlayer(p, 3);
    expect(looped).toBe(1);
  });

  it('emits onFinished when a non-looping run reaches the end (signals enabled)', () => {
    const p = player(10, { loop: false, time: 9 });
    enableAnimationPlayerSignals(p);
    let finished = 0;
    connectSignal(p.onFinished!, () => finished++);
    advanceAnimationPlayer(p, 5);
    expect(finished).toBe(1);
  });

  it('emits crossed clip events in forward order', () => {
    const p = eventPlayer(10, [1, 3, 7], { loop: false });
    enableAnimationPlayerSignals(p);
    const crossed: number[] = [];
    connectSignal(p.onEvent!, (event) => crossed.push(event.payload as number));
    advanceAnimationPlayer(p, 4);
    expect(crossed).toEqual([1, 3]);
  });

  it('emits time-zero and end markers once per crossed Repeat boundary', () => {
    const p = eventPlayer(10, [0, 2, 10], { time: 9 });
    enableAnimationPlayerSignals(p);
    const crossed: number[] = [];
    connectSignal(p.onEvent!, (event) => crossed.push(event.time));
    advanceAnimationPlayer(p, 13);
    expect(crossed).toEqual([10, 0, 2, 10, 0, 2]);
  });

  it('emits reverse crossings and loop-entry markers in reverse traversal order', () => {
    const p = eventPlayer(10, [0, 2, 8, 10], { speed: -1, time: 1 });
    enableAnimationPlayerSignals(p);
    const crossed: number[] = [];
    connectSignal(p.onEvent!, (event) => crossed.push(event.time));
    advanceAnimationPlayer(p, 4);
    expect(crossed).toEqual([0, 10, 8]);
  });

  it('does not double-fire a PingPong boundary marker on reflection', () => {
    const p = eventPlayer(10, [8, 10], { loopMode: 'PingPong', time: 9 });
    enableAnimationPlayerSignals(p);
    const crossed: number[] = [];
    connectSignal(p.onEvent!, (event) => crossed.push(event.time));
    advanceAnimationPlayer(p, 3);
    expect(crossed).toEqual([10, 8]);
  });
});

describe('cloneAnimationPlayer', () => {
  it('copies fields, shares the clip, and starts signal-free', () => {
    const p = player(10, { loop: false, loopMode: 'PingPong', repeatCount: 3, speed: 2, time: 4 });
    enableAnimationPlayerSignals(p);
    const clone = cloneAnimationPlayer(p);
    expect(clone).not.toBe(p);
    expect(clone.clip).toBe(p.clip);
    expect(clone.loop).toBe(false);
    expect(clone.loopMode).toBe('PingPong');
    expect(clone.repeatCount).toBe(3);
    expect(clone.speed).toBe(2);
    expect(clone.time).toBe(4);
    expect(clone.onEvent).toBeNull();
    expect(clone.onFinished).toBeNull();
    expect(clone.onLooped).toBeNull();
    expect(EntityRuntimeKey in clone).toBe(true);
  });
});

describe('createAnimationPlayer', () => {
  it('defaults to looping, playing, speed 1, time 0', () => {
    const p = player(5);
    expect(p.loop).toBe(true);
    expect(p.playing).toBe(true);
    expect(p.speed).toBe(1);
    expect(p.time).toBe(0);
    expect(EntityRuntimeKey in p).toBe(true);
  });

  it('defaults to Repeat loop mode, infinite repeats, and no signals', () => {
    const p = player(5);
    expect(p.loopMode).toBe('Repeat');
    expect(p.repeatCount).toBe(-1);
    expect(p.onFinished).toBeNull();
    expect(p.onLooped).toBeNull();
    expect(p.onEvent).toBeNull();
  });
});

describe('enableAnimationPlayerSignals', () => {
  it('allocates the opt-in signals', () => {
    const p = player(5);
    enableAnimationPlayerSignals(p);
    expect(p.onFinished).not.toBeNull();
    expect(p.onLooped).not.toBeNull();
    expect(p.onEvent).not.toBeNull();
  });

  it('is idempotent (keeps the existing signal instances)', () => {
    const p = player(5);
    enableAnimationPlayerSignals(p);
    const finished = p.onFinished;
    const looped = p.onLooped;
    const event = p.onEvent;
    enableAnimationPlayerSignals(p);
    expect(p.onFinished).toBe(finished);
    expect(p.onLooped).toBe(looped);
    expect(p.onEvent).toBe(event);
  });
});

describe('getAnimationPlayerNormalizedTime', () => {
  it('returns time / duration in [0, 1]', () => {
    const p = player(10, { time: 2.5 });
    expect(getAnimationPlayerNormalizedTime(p)).toBeCloseTo(0.25);
    seekAnimationPlayer(p, 10);
    expect(getAnimationPlayerNormalizedTime(p)).toBe(1);
  });

  it('returns 0 for a zero-duration clip', () => {
    const p = player(0);
    expect(getAnimationPlayerNormalizedTime(p)).toBe(0);
  });
});

describe('initializeAnimationPlayer', () => {
  it('is the construction initializer of createAnimationPlayer', () => {
    expect(typeof initializeAnimationPlayer).toBe('function');
  });
});

describe('playAnimationPlayer', () => {
  it('sets playing true without moving the playhead', () => {
    const p = player(10, { playing: false, time: 3 });
    playAnimationPlayer(p);
    expect(p.playing).toBe(true);
    expect(p.time).toBe(3);
  });
});

describe('seekAnimationPlayer', () => {
  it('clamps the playhead to [0, duration]', () => {
    const p = player(10);
    seekAnimationPlayer(p, 4);
    expect(p.time).toBe(4);
    seekAnimationPlayer(p, -1);
    expect(p.time).toBe(0);
    seekAnimationPlayer(p, 99);
    expect(p.time).toBe(10);
  });
});
describe('stopAnimationPlayer', () => {
  it('clears playing and rewinds to 0', () => {
    const p = player(10, { time: 5 });
    stopAnimationPlayer(p);
    expect(p.playing).toBe(false);
    expect(p.time).toBe(0);
  });
});
