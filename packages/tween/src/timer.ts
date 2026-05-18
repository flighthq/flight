import type { Tween, TweenManager, TweenOptions } from '@flighthq/types';

import { createTween } from './tween';

export function createTimer(manager: TweenManager, duration: number, options?: Readonly<TweenOptions>): Tween<object> {
  return createTween(manager, {}, duration, {}, options);
}
