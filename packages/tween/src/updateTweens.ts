import { emitSignal } from '@flighthq/signals';
import type { Tween, TweenManager } from '@flighthq/types';

import { initializeTween } from './internal';

function updateTween<T extends object>(tween: Tween<T>, deltaTime: number): void {
  if (tween.paused || tween.complete) return;

  tween.elapsed += deltaTime;

  const activeElapsed = tween.elapsed - tween.delay;
  if (activeElapsed <= 0) return;

  if (!tween.initialized) initializeTween(tween);

  const t = Math.min(activeElapsed / tween.duration, 1);
  const effectiveT = tween.reverse ? 1 - t : t;
  const easedT = tween.ease(effectiveT);

  const target = tween.target as Record<string, number>;
  for (const detail of tween.properties) {
    let value = detail.start + detail.change * easedT;
    if (tween.snapping) value = Math.round(value);
    target[detail.key] = value;
  }

  emitSignal(tween.onUpdate);

  if (t >= 1) {
    if (tween.repeat === 0) {
      tween.complete = true;
      emitSignal(tween.onComplete);
    } else {
      if (tween.reflect) tween.reverse = !tween.reverse;
      tween.elapsed = tween.delay;
      if (tween.repeat > 0) tween.repeat--;
      emitSignal(tween.onRepeat);
    }
  }
}

export function completeTween<T extends object>(tween: Tween<T>): void {
  if (tween.complete) return;
  if (!tween.initialized) initializeTween(tween);
  const effectiveT = tween.reverse ? 0 : 1;
  const easedT = tween.ease(effectiveT);
  const target = tween.target as Record<string, number>;
  for (const detail of tween.properties) {
    let value = detail.start + detail.change * easedT;
    if (tween.snapping) value = Math.round(value);
    target[detail.key] = value;
  }
  tween.complete = true;
  emitSignal(tween.onComplete);
}

export function updateTweens(manager: TweenManager, deltaTime: number): void {
  for (const [target, list] of manager.tweens) {
    let i = list.length - 1;
    while (i >= 0) {
      if (list[i].complete) {
        list.splice(i, 1);
      } else {
        updateTween(list[i], deltaTime);
      }
      i--;
    }
    if (list.length === 0) manager.tweens.delete(target);
  }
}
