import { createTweenManager } from './tweenManager';
import { createTweenStagger } from './tweenStagger';
import { updateTweens } from './updateTweens';

describe('createTweenStagger', () => {
  it('returns an empty array for empty targets', () => {
    const manager = createTweenManager();
    const targets: { x: number }[] = [];
    expect(createTweenStagger(manager, targets, 1000, {})).toEqual([]);
  });

  it('returns one tween per target', () => {
    const manager = createTweenManager();
    const targets = [{ x: 0 }, { x: 0 }, { x: 0 }];
    const tweens = createTweenStagger(manager, targets, 1000, { x: 100 });
    expect(tweens).toHaveLength(3);
  });

  it('each tween targets the corresponding element', () => {
    const manager = createTweenManager();
    const targets = [{ x: 0 }, { x: 0 }];
    const tweens = createTweenStagger(manager, targets, 1000, { x: 100 });
    expect(tweens[0].target).toBe(targets[0]);
    expect(tweens[1].target).toBe(targets[1]);
  });

  it('staggers start delays by each interval (from: start default)', () => {
    const manager = createTweenManager();
    const targets = [{ x: 0 }, { x: 0 }, { x: 0 }];
    // Using ms units throughout. each=200ms.
    // Formula: position[i] = i/(count-1), delay = position * each * (count-1) = i * each
    const tweens = createTweenStagger(manager, targets, 1000, { x: 100 }, { each: 200 });
    expect(tweens[0].delay).toBeCloseTo(0);
    expect(tweens[1].delay).toBeCloseTo(200);
    expect(tweens[2].delay).toBeCloseTo(400);
  });

  it('from: end reverses the stagger order', () => {
    const manager = createTweenManager();
    const targets = [{ x: 0 }, { x: 0 }, { x: 0 }];
    // each=100ms. from end: last target delay=0, first target delay=200ms
    const tweens = createTweenStagger(manager, targets, 1000, { x: 100 }, { each: 100, from: 'end' });
    expect(tweens[2].delay).toBeCloseTo(0);
    expect(tweens[0].delay).toBeCloseTo(200);
  });

  it('from: center staggers outward from the middle', () => {
    const manager = createTweenManager();
    const targets = [{ x: 0 }, { x: 0 }, { x: 0 }, { x: 0 }, { x: 0 }];
    // center index = 2. Distances: [2,1,0,1,2]. Max=2.
    // positions: [1, 0.5, 0, 0.5, 1] * each * (count-1) = pos * 100 * 4
    const tweens = createTweenStagger(manager, targets, 1000, { x: 100 }, { each: 100, from: 'center' });
    expect(tweens[2].delay).toBeCloseTo(0);
    expect(tweens[0].delay).toBeCloseTo(400);
    expect(tweens[4].delay).toBeCloseTo(400);
  });

  it('from: numeric index staggers outward from that index', () => {
    const manager = createTweenManager();
    const targets = [{ x: 0 }, { x: 0 }, { x: 0 }];
    // Origin index 0, max distance=2. positions: [0, 0.5, 1] * each * (count-1) = pos * 100 * 2
    const tweens = createTweenStagger(manager, targets, 1000, { x: 100 }, { each: 100, from: 0 });
    expect(tweens[0].delay).toBeCloseTo(0);
    expect(tweens[1].delay).toBeCloseTo(100);
    expect(tweens[2].delay).toBeCloseTo(200);
  });

  it('adds baseDelay from options to all stagger delays', () => {
    const manager = createTweenManager();
    const targets = [{ x: 0 }, { x: 0 }];
    // each=100ms, base delay=500ms
    const tweens = createTweenStagger(manager, targets, 1000, { x: 100 }, { each: 100 }, { delay: 500 });
    expect(tweens[0].delay).toBeCloseTo(500);
    expect(tweens[1].delay).toBeCloseTo(600);
  });

  it('actually animates targets with staggered timing', () => {
    const manager = createTweenManager();
    const targets = [{ x: 0 }, { x: 0 }];
    // each=200ms: target[0] starts at 0ms, target[1] starts at 200ms
    createTweenStagger(manager, targets, 1000, { x: 100 }, { each: 200 }, { ease: (t) => t });
    updateTweens(manager, 100); // target[0] at 100/1000=10%; target[1] delay=200 not reached
    expect(targets[0].x).toBeCloseTo(10);
    expect(targets[1].x).toBe(0); // still in delay
  });

  it('passes duration correctly to each tween', () => {
    const manager = createTweenManager();
    const targets = [{ x: 0 }, { x: 0 }];
    const tweens = createTweenStagger(manager, targets, 2000, { x: 100 });
    expect(tweens[0].duration).toBe(2000);
    expect(tweens[1].duration).toBe(2000);
  });
});
