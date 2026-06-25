import { connectSignal } from '@flighthq/signals';

import { createTween } from './tween';
import { createTweenManager } from './tweenManager';
import { getTweenProgress, invalidateTween, restartTween, seekTween, setTweenProgress } from './tweenProgress';
import { updateTweens } from './updateTweens';

describe('getTweenProgress', () => {
  it('returns 0 before any update', () => {
    const manager = createTweenManager();
    const tween = createTween(manager, { x: 0 }, 1000, { x: 100 });
    expect(getTweenProgress(tween)).toBe(0);
  });
  it('returns 0 while still in delay phase', () => {
    const manager = createTweenManager();
    const tween = createTween(manager, { x: 0 }, 1000, { x: 100 }, { delay: 500 });
    updateTweens(manager, 400);
    expect(getTweenProgress(tween)).toBe(0);
  });
  it('returns 0.5 at the halfway point', () => {
    const manager = createTweenManager();
    const tween = createTween(manager, { x: 0 }, 1000, { x: 100 }, { ease: (t) => t });
    updateTweens(manager, 500);
    expect(getTweenProgress(tween)).toBeCloseTo(0.5);
  });
  it('returns 1 when complete', () => {
    const manager = createTweenManager();
    const tween = createTween(manager, { x: 0 }, 1000, { x: 100 });
    updateTweens(manager, 1000);
    expect(getTweenProgress(tween)).toBe(1);
  });
});

describe('invalidateTween', () => {
  it('resets initialized, complete, and elapsed', () => {
    const manager = createTweenManager();
    const tween = createTween(manager, { x: 0 }, 1000, { x: 100 }, { ease: (t) => t });
    updateTweens(manager, 1000);
    expect(tween.complete).toBe(true);
    invalidateTween(tween);
    expect(tween.initialized).toBe(false);
    expect(tween.complete).toBe(false);
    expect(tween.elapsed).toBe(0);
  });
  it('re-captures start values from current target state on next update', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    updateTweens(manager, 1000); // x is now 100
    invalidateTween(tween);
    // Re-register: the new start is 100
    manager.tweens.get(target)?.push(tween);
    updateTweens(manager, 1000); // tween from 100 to 100 (end is absolute 100, so change is 0)
    expect(target.x).toBe(100);
  });
});

describe('restartTween', () => {
  it('resets complete and elapsed to zero', () => {
    const manager = createTweenManager();
    const tween = createTween(manager, { x: 0 }, 1000, { x: 100 }, { ease: (t) => t });
    updateTweens(manager, 1000);
    expect(tween.complete).toBe(true);
    restartTween(tween);
    expect(tween.complete).toBe(false);
    expect(tween.elapsed).toBe(0);
  });
  it('includeDelay=false skips the initial delay', () => {
    const manager = createTweenManager();
    const tween = createTween(manager, { x: 0 }, 1000, { x: 100 }, { delay: 500 });
    restartTween(tween, false);
    expect(tween.elapsed).toBe(500); // elapsed = delay so active immediately
  });
  it('keeps initialized=false so start values are re-captured', () => {
    const manager = createTweenManager();
    const tween = createTween(manager, { x: 0 }, 1000, { x: 100 });
    updateTweens(manager, 500); // gets initialized
    restartTween(tween);
    expect(tween.initialized).toBe(false);
  });
});

describe('seekTween', () => {
  it('immediately applies property values at the given time', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    seekTween(tween, 500);
    expect(target.x).toBeCloseTo(50);
  });
  it('clamps to 0 when time is negative', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    seekTween(tween, -100);
    expect(target.x).toBe(0);
  });
  it('clamps to the end value when time exceeds duration', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    seekTween(tween, 9999);
    expect(target.x).toBe(100);
    expect(tween.complete).toBe(true);
  });
  it('accounts for delay in the elapsed time', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t, delay: 500 });
    seekTween(tween, 1000); // delay=500 + 500ms active = 50%
    expect(target.x).toBeCloseTo(50);
  });
  it('emits onUpdate when applying values', () => {
    const manager = createTweenManager();
    const tween = createTween(manager, { x: 0 }, 1000, { x: 100 });
    let updates = 0;
    connectSignal(tween.onUpdate, () => updates++);
    seekTween(tween, 500);
    expect(updates).toBe(1);
  });
  it('is alias-safe: out === input does not produce wrong values', () => {
    // The tween's target is both the input (start values are read from it) and the output.
    // initializeTween reads `target.x` then we write to `target.x`.
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    seekTween(tween, 500);
    expect(target.x).toBeCloseTo(50);
    // Calling again should be consistent
    seekTween(tween, 750);
    expect(target.x).toBeCloseTo(75);
  });
});

describe('setTweenProgress', () => {
  it('applies the progress fraction to target values', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    setTweenProgress(tween, 0.5);
    expect(target.x).toBeCloseTo(50);
  });
  it('clamps progress to 0', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    setTweenProgress(tween, -1);
    expect(target.x).toBe(0);
  });
  it('clamps progress to 1 and marks tween complete', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    setTweenProgress(tween, 2);
    expect(target.x).toBe(100);
    expect(tween.complete).toBe(true);
  });
  it('is alias-safe: multiple sequential calls produce consistent results', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    setTweenProgress(tween, 0.25);
    expect(target.x).toBeCloseTo(25);
    setTweenProgress(tween, 0.75);
    expect(target.x).toBeCloseTo(75);
  });
});
