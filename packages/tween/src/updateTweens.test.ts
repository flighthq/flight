import { connectSignal } from '@flighthq/signals';

import { createTween, pauseTween, resumeTween } from './tween';
import { createTweenManager } from './tweenManager';
import { completeTween, updateTweens } from './updateTweens';

describe('completeTween', () => {
  it('jumps target to end value and marks tween complete', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    completeTween(tween);
    expect(target.x).toBe(100);
    expect(tween.complete).toBe(true);
  });

  it('emits onComplete', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 });
    let fired = 0;
    connectSignal(tween.onComplete, () => fired++);
    completeTween(tween);
    expect(fired).toBe(1);
  });

  it('works on an uninitialized tween (before first update)', () => {
    const manager = createTweenManager();
    const target = { x: 25 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    expect(tween.initialized).toBe(false);
    completeTween(tween);
    expect(target.x).toBe(100);
  });

  it('lands on start value when reverse=true', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t, reverse: true });
    completeTween(tween);
    expect(target.x).toBe(0); // reverse completes at start (0), not end (100)
    expect(tween.complete).toBe(true);
  });

  it('is a no-op on an already complete tween', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    completeTween(tween);
    target.x = 0;
    completeTween(tween);
    expect(target.x).toBe(0);
  });
});

describe('smartRotation', () => {
  it('takes the short path for a large positive delta', () => {
    const manager = createTweenManager();
    const target = { rotation: 0 };
    // 350° forward is the same as -10° backward — smart path is -10
    createTween(manager, target, 1000, { rotation: 350 }, { ease: (t) => t, smartRotation: true });
    updateTweens(manager, 500);
    expect(target.rotation).toBeCloseTo(-5);
  });

  it('takes the short path for a large negative delta', () => {
    const manager = createTweenManager();
    const target = { rotation: 0 };
    // -350° backward is the same as +10° forward — smart path is +10
    createTween(manager, target, 1000, { rotation: -350 }, { ease: (t) => t, smartRotation: true });
    updateTweens(manager, 500);
    expect(target.rotation).toBeCloseTo(5);
  });

  it('finds the short path when starting from a non-zero angle', () => {
    const manager = createTweenManager();
    const target = { rotation: 350 };
    // Naive delta: 10 - 350 = -340°. Smart path: +20° (go forward, not backward).
    // start=350, change=+20, midpoint: 360, end: 370
    createTween(manager, target, 1000, { rotation: 10 }, { ease: (t) => t, smartRotation: true });
    updateTweens(manager, 500);
    expect(target.rotation).toBeCloseTo(360);
    updateTweens(manager, 500);
    expect(target.rotation).toBeCloseTo(370);
  });

  it('leaves small deltas unchanged', () => {
    const manager = createTweenManager();
    const target = { rotation: 0 };
    createTween(manager, target, 1000, { rotation: 90 }, { ease: (t) => t, smartRotation: true });
    updateTweens(manager, 500);
    expect(target.rotation).toBeCloseTo(45);
  });
});

describe('updateTweens', () => {
  it('interpolates property toward target value', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    updateTweens(manager, 500);
    expect(target.x).toBeCloseTo(50);
  });

  it('reaches target value at end of duration', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    updateTweens(manager, 1000);
    expect(target.x).toBe(100);
  });

  it('animates multiple properties independently to their respective targets', () => {
    const manager = createTweenManager();
    const target = { x: 0, y: 0 };
    createTween(manager, target, 1000, { x: 100, y: 200 }, { ease: (t) => t });
    updateTweens(manager, 1000);
    expect(target.x).toBe(100);
    expect(target.y).toBe(200);
  });

  it('marks tween complete after duration', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 });
    updateTweens(manager, 1000);
    expect(tween.complete).toBe(true);
  });

  it('removes completed tweens from manager', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    createTween(manager, target, 1000, { x: 100 });
    updateTweens(manager, 1000);
    updateTweens(manager, 0);
    expect(manager.tweens.has(target)).toBe(false);
  });

  it('emits onComplete when finished', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 });
    let fired = 0;
    connectSignal(tween.onComplete, () => fired++);
    updateTweens(manager, 1000);
    expect(fired).toBe(1);
  });

  it('emits onUpdate each tick', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 });
    let updates = 0;
    connectSignal(tween.onUpdate, () => updates++);
    updateTweens(manager, 250);
    updateTweens(manager, 250);
    expect(updates).toBe(2);
  });

  it('respects delay before starting', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t, delay: 500 });
    updateTweens(manager, 500);
    expect(target.x).toBe(0);
    updateTweens(manager, 500);
    expect(target.x).toBeCloseTo(50);
  });

  it('repeats the specified number of times', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t, repeat: 2 });
    let repeats = 0;
    connectSignal(tween.onRepeat, () => repeats++);
    updateTweens(manager, 1000);
    updateTweens(manager, 1000);
    updateTweens(manager, 1000);
    expect(repeats).toBe(2);
    expect(tween.complete).toBe(true);
  });

  it('reverse: true animates from end value back to start', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    // At 10% duration, a reversed linear tween is at 90% of the range
    createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t, reverse: true });
    updateTweens(manager, 100);
    expect(target.x).toBeCloseTo(90);
    updateTweens(manager, 900);
    expect(target.x).toBe(0);
  });

  it('reflect reverses direction on each repeat, arriving back at start', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t, repeat: 1, reflect: true });
    updateTweens(manager, 1000); // play 1 forward: x → 100
    expect(target.x).toBe(100);
    updateTweens(manager, 250); // 25% into reflected play 2: going backward, so x = 75 not 25
    expect(target.x).toBeCloseTo(75);
    updateTweens(manager, 750); // play 2 completes: x → 0
    expect(target.x).toBe(0);
  });

  it('repeat: -1 loops indefinitely without ever completing', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t, repeat: -1 });
    let repeats = 0;
    connectSignal(tween.onRepeat, () => repeats++);
    updateTweens(manager, 1000);
    updateTweens(manager, 1000);
    updateTweens(manager, 1000);
    expect(repeats).toBe(3);
    expect(tween.complete).toBe(false);
    expect(tween.repeat).toBe(-1);
  });

  it('rounds values when snapping=true', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t, snapping: true });
    updateTweens(manager, 333);
    expect(Number.isInteger(target.x)).toBe(true);
  });

  it('does not update paused tween', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    pauseTween(tween);
    updateTweens(manager, 500);
    expect(target.x).toBe(0);
  });

  it('resumes after pause', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    pauseTween(tween);
    updateTweens(manager, 500);
    resumeTween(tween);
    updateTweens(manager, 500);
    expect(target.x).toBeCloseTo(50);
  });

  it('elapsed does not accumulate while paused', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    pauseTween(tween);
    updateTweens(manager, 500);
    expect(tween.elapsed).toBe(0);
    resumeTween(tween);
    updateTweens(manager, 500);
    expect(target.x).toBeCloseTo(50); // 500ms of actual animation, not 1000ms
  });
});
