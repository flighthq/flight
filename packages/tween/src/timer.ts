import { createTween } from './tween.ts';
import type { Tween, TweenManager, TweenOptions } from './types.ts';

export function createTweenTimer(
  manager: TweenManager,
  duration: number,
  options?: Readonly<TweenOptions>,
): Tween<object> {
  return createTween(manager, {}, duration, {}, options);
}
