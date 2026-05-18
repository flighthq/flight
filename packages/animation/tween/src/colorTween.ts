import { connectSignal } from '@flighthq/signals';
import type { Tween, TweenManager, TweenOptions } from '@flighthq/types';

import { createTween } from './tween.js';

type ColorComponents = { b: number; g: number; r: number };

/**
 * Tween a packed 0xRRGGBB color property on target.
 * Components are interpolated in float space; the composed value written on each
 * update is always a rounded integer.
 */
export function createColorTween(
  manager: TweenManager,
  target: Record<string, number>,
  property: string,
  duration: number,
  toColor: number,
  options?: Readonly<TweenOptions>,
): Tween<ColorComponents> {
  const fromColor = target[property] ?? 0;
  const components: ColorComponents = {
    b: fromColor & 0xff,
    g: (fromColor >> 8) & 0xff,
    r: (fromColor >> 16) & 0xff,
  };
  const tween = createTween(
    manager,
    components,
    duration,
    {
      b: toColor & 0xff,
      g: (toColor >> 8) & 0xff,
      r: (toColor >> 16) & 0xff,
    },
    options,
  );
  connectSignal(tween.onUpdate, () => {
    target[property] =
      ((Math.round(components.r) & 0xff) << 16) |
      ((Math.round(components.g) & 0xff) << 8) |
      (Math.round(components.b) & 0xff);
  });
  return tween;
}
