import { createTween } from './tween';
import { createTweenManager, defaultManager } from './tweenManager';
import { updateTweens } from './updateTweens';

describe('createTweenManager', () => {
  it('returns a TweenManager with empty tweens map', () => {
    const manager = createTweenManager();
    expect(manager.tweens).toBeInstanceOf(Map);
    expect(manager.tweens.size).toBe(0);
  });

  it('each call returns a distinct instance', () => {
    const a = createTweenManager();
    const b = createTweenManager();
    expect(a).not.toBe(b);
    expect(a.tweens).not.toBe(b.tweens);
  });
});

describe('defaultEase', () => {
  it('defaults to easeOutExponential when no option provided', () => {
    const manager = createTweenManager();
    expect(typeof manager.defaultEase).toBe('function');
    expect(manager.defaultEase(0)).toBe(0);
    expect(manager.defaultEase(1)).toBeCloseTo(1);
  });

  it('uses provided defaultEase for tweens that omit ease option', () => {
    const linearEase = (t: number) => t;
    const manager = createTweenManager({ defaultEase: linearEase });
    const target = { x: 0 };
    createTween(manager, target, 1000, { x: 100 });
    updateTweens(manager, 500);
    expect(target.x).toBeCloseTo(50); // linear: exactly 50% at 50% time
  });

  it('explicit ease option overrides defaultEase', () => {
    const linearEase = (t: number) => t;
    const alwaysOne = () => 1;
    const manager = createTweenManager({ defaultEase: linearEase });
    const target = { x: 0 };
    createTween(manager, target, 1000, { x: 100 }, { ease: alwaysOne });
    updateTweens(manager, 1);
    expect(target.x).toBe(100); // alwaysOne ease jumps straight to end
  });
});

describe('defaultManager', () => {
  it('is a TweenManager', () => {
    expect(defaultManager.tweens).toBeInstanceOf(Map);
  });
});
