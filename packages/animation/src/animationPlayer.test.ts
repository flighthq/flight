import { createAnimationClip } from './animationClip';
import { advanceAnimationPlayer, createAnimationPlayer, seekAnimationPlayer } from './animationPlayer';

function player(duration: number, opts?: Parameters<typeof createAnimationPlayer>[1]) {
  return createAnimationPlayer(createAnimationClip([], duration), opts);
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
});

describe('createAnimationPlayer', () => {
  it('defaults to looping, playing, speed 1, time 0', () => {
    const p = player(5);
    expect(p.loop).toBe(true);
    expect(p.playing).toBe(true);
    expect(p.speed).toBe(1);
    expect(p.time).toBe(0);
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
