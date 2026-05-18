import { connectSignal } from '@flighthq/signals';

import { createTimer } from './timer';
import { createTweenManager } from './tweenManager';
import { updateTweens } from './updateTweens';

describe('createTimer', () => {
  it('fires onComplete after the specified duration', () => {
    const manager = createTweenManager();
    const timer = createTimer(manager, 1000);
    let fired = 0;
    connectSignal(timer.onComplete, () => fired++);
    updateTweens(manager, 1000);
    expect(fired).toBe(1);
  });

  it('does not fire onComplete before duration elapses', () => {
    const manager = createTweenManager();
    const timer = createTimer(manager, 1000);
    let fired = 0;
    connectSignal(timer.onComplete, () => fired++);
    updateTweens(manager, 500);
    expect(fired).toBe(0);
  });

  it('respects the delay option', () => {
    const manager = createTweenManager();
    const timer = createTimer(manager, 1000, { delay: 500 });
    let fired = 0;
    connectSignal(timer.onComplete, () => fired++);
    updateTweens(manager, 1000);
    expect(fired).toBe(0);
    updateTweens(manager, 500);
    expect(fired).toBe(1);
  });

  it('each call produces an independent sentinel target', () => {
    const manager = createTweenManager();
    const t1 = createTimer(manager, 1000);
    const t2 = createTimer(manager, 1000);
    expect(t1.target).not.toBe(t2.target);
    expect(manager.tweens.size).toBe(2);
  });

  it('fires onRepeat and keeps running when repeat: -1', () => {
    const manager = createTweenManager();
    const timer = createTimer(manager, 1000, { repeat: -1 });
    let ticks = 0;
    connectSignal(timer.onRepeat, () => ticks++);
    updateTweens(manager, 1000);
    updateTweens(manager, 1000);
    updateTweens(manager, 1000);
    expect(ticks).toBe(3);
    expect(timer.complete).toBe(false);
  });
});
