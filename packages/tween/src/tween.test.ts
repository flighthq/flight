import { connectSignal } from '@flighthq/signals';

import {
  applyTween,
  createTween,
  pauseAllTweens,
  pauseTween,
  pauseTweens,
  resetAllTweens,
  resumeAllTweens,
  resumeTween,
  resumeTweens,
  stopAllTweens,
  stopTweens,
} from './tween';
import { createTweenManager } from './tweenManager';
import { updateTweens } from './updateTweens';

describe('applyTween', () => {
  it('immediately sets properties on target', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    applyTween(manager, target, { x: 50 });
    expect(target.x).toBe(50);
  });

  it('stops conflicting tweens before applying', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 });
    applyTween(manager, target, { x: 50 });
    expect(tween.complete).toBe(true);
    expect(target.x).toBe(50);
  });
});

describe('createTween', () => {
  it('registers with manager', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    createTween(manager, target, 1000, { x: 100 });
    expect(manager.tweens.has(target)).toBe(true);
  });

  it('uses defaultManager when no manager provided', () => {
    const target = { x: 0 };
    const tween = createTween(target, 1000, { x: 100 });
    expect(tween.target).toBe(target);
  });

  it('stops existing tween on same property when overwrite=true', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const first = createTween(manager, target, 1000, { x: 100 });
    createTween(manager, target, 1000, { x: 200 });
    expect(first.complete).toBe(true);
  });

  it('does not stop existing tween when overwrite=false', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const first = createTween(manager, target, 1000, { x: 100 });
    createTween(manager, target, 1000, { x: 200 }, { overwrite: false });
    expect(first.complete).toBe(false);
  });

  it('does not stop existing tween with non-overlapping properties', () => {
    const manager = createTweenManager();
    const target = { x: 0, y: 0 };
    const first = createTween(manager, target, 1000, { x: 100 });
    createTween(manager, target, 1000, { y: 200 });
    expect(first.complete).toBe(false);
  });

  it('initializes with correct defaults', () => {
    const manager = createTweenManager();
    const tween = createTween(manager, { x: 0 }, 1000, { x: 100 });
    expect(tween.complete).toBe(false);
    expect(tween.elapsed).toBe(0);
    expect(tween.paused).toBe(false);
    expect(tween.repeat).toBe(0);
    expect(tween.reflect).toBe(false);
    expect(tween.reverse).toBe(false);
    expect(tween.smartRotation).toBe(false);
    expect(tween.snapping).toBe(false);
  });

  it('pre-allocates properties array from propertyMap at creation', () => {
    const manager = createTweenManager();
    const tween = createTween(manager, { x: 0, y: 0 }, 1000, { x: 100, y: 200 });
    expect(tween.properties).toHaveLength(2);
    expect(tween.properties.map((d) => d.key)).toEqual(expect.arrayContaining(['x', 'y']));
  });
});

describe('pauseAllTweens', () => {
  it('sets paused=true on every tween in the manager', () => {
    const manager = createTweenManager();
    const a = createTween(manager, { x: 0 }, 1000, { x: 100 });
    pauseAllTweens(manager);
    expect(a.paused).toBe(true);
  });
});

describe('pauseTween', () => {
  it('sets paused to true on a single tween', () => {
    const manager = createTweenManager();
    const tween = createTween(manager, { x: 0 }, 1000, { x: 100 });
    pauseTween(tween);
    expect(tween.paused).toBe(true);
  });
});

describe('pauseTweens', () => {
  it('pauses only tweens for the given target', () => {
    const manager = createTweenManager();
    const t = createTween(manager, { x: 0 }, 1000, { x: 100 });
    pauseTweens(manager, t.target);
    expect(t.paused).toBe(true);
  });
});

describe('resetAllTweens', () => {
  it('removes all tweens from the manager without completing them', () => {
    const manager = createTweenManager();
    const a = createTween(manager, { x: 0 }, 1000, { x: 100 });
    const b = createTween(manager, { y: 0 }, 1000, { y: 100 });
    resetAllTweens(manager);
    expect(manager.tweens.size).toBe(0);
    expect(a.complete).toBe(false);
    expect(b.complete).toBe(false);
  });
});

describe('resumeAllTweens', () => {
  it('sets paused=false on every tween in the manager', () => {
    const manager = createTweenManager();
    const a = createTween(manager, { x: 0 }, 1000, { x: 100 });
    pauseAllTweens(manager);
    resumeAllTweens(manager);
    expect(a.paused).toBe(false);
  });
});

describe('resumeTween', () => {
  it('sets paused to false on a single tween', () => {
    const manager = createTweenManager();
    const tween = createTween(manager, { x: 0 }, 1000, { x: 100 });
    pauseTween(tween);
    resumeTween(tween);
    expect(tween.paused).toBe(false);
  });
});

describe('resumeTweens', () => {
  it('resumes only tweens for the given target', () => {
    const manager = createTweenManager();
    const t = createTween(manager, { x: 0 }, 1000, { x: 100 });
    pauseTweens(manager, t.target);
    resumeTweens(manager, t.target);
    expect(t.paused).toBe(false);
  });
});

describe('stopAllTweens', () => {
  it('marks every tween in the manager as complete', () => {
    const manager = createTweenManager();
    const a = createTween(manager, { x: 0 }, 1000, { x: 100 });
    stopAllTweens(manager);
    expect(a.complete).toBe(true);
  });
});

describe('stopTweens', () => {
  it('stops all tweens for a target', () => {
    const manager = createTweenManager();
    const target = { x: 0, y: 0 };
    const a = createTween(manager, target, 1000, { x: 100 });
    const b = createTween(manager, target, 1000, { y: 100 }, { overwrite: false });
    stopTweens(manager, target);
    expect(a.complete).toBe(true);
    expect(b.complete).toBe(true);
  });

  it('stops only tweens with matching properties', () => {
    const manager = createTweenManager();
    const target = { x: 0, y: 0 };
    const a = createTween(manager, target, 1000, { x: 100 });
    const b = createTween(manager, target, 1000, { y: 100 }, { overwrite: false });
    stopTweens(manager, target, { x: 0 });
    expect(a.complete).toBe(true);
    expect(b.complete).toBe(false);
  });

  it('leaves the target value at its current position, does not jump to end', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    updateTweens(manager, 500);
    expect(target.x).toBeCloseTo(50);
    stopTweens(manager, target);
    expect(target.x).toBeCloseTo(50); // unchanged — use completeTween to jump to end instead
  });

  it('complete: true jumps to end values before stopping', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    createTween(manager, target, 1000, { x: 100 }, { ease: (t) => t });
    updateTweens(manager, 500);
    stopTweens(manager, target, undefined, { complete: true });
    expect(target.x).toBe(100);
  });

  it('complete: true fires onComplete by default', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 });
    let fired = 0;
    connectSignal(tween.onComplete, () => fired++);
    stopTweens(manager, target, undefined, { complete: true });
    expect(fired).toBe(1);
  });

  it('complete: true with sendEvent: false suppresses onComplete', () => {
    const manager = createTweenManager();
    const target = { x: 0 };
    const tween = createTween(manager, target, 1000, { x: 100 });
    let fired = 0;
    connectSignal(tween.onComplete, () => fired++);
    stopTweens(manager, target, undefined, { complete: true, sendEvent: false });
    expect(fired).toBe(0);
    expect(target.x).toBe(100); // values still applied
  });
});
