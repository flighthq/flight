import type {
  EasingFunction,
  NumericProps,
  Tween,
  TweenManager,
  TweenOptions,
  TweenStaggerOptions,
} from '@flighthq/types';

import { createTween } from './tween';

/**
 * Batch-tween an array of targets with staggered start delays.
 * Returns the array of created tweens in the same order as `targets`.
 *
 * Each tween inherits `options` but gets an additional `delay` equal to its position in the
 * stagger sequence (plus any `options.delay` already set).
 */
export function createTweenStagger<T extends object>(
  manager: TweenManager,
  targets: readonly T[],
  duration: number,
  propertyMap: Readonly<NumericProps<T>>,
  stagger?: Readonly<TweenStaggerOptions>,
  options?: Readonly<TweenOptions>,
): Tween<T>[] {
  if (targets.length === 0) return [];
  const each = stagger?.each ?? 0.1;
  const from = stagger?.from ?? 'start';
  const staggerEase = stagger?.staggerEase;
  const baseDelay = options?.delay ?? 0;
  const count = targets.length;
  const tweens: Tween<T>[] = [];
  for (let i = 0; i < count; i++) {
    const staggerOffset = computeStaggerDelay(i, count, each, from, staggerEase);
    const tween = createTween(manager, targets[i], duration, propertyMap, {
      ...options,
      delay: baseDelay + staggerOffset,
    });
    tweens.push(tween);
  }
  return tweens;
}

function computeStaggerDelay(
  index: number,
  count: number,
  each: number,
  from: 'center' | 'end' | 'start' | number,
  staggerEase?: EasingFunction,
): number {
  if (count <= 1) return 0;
  let normalizedPosition: number;
  if (from === 'start') {
    normalizedPosition = index / (count - 1);
  } else if (from === 'end') {
    normalizedPosition = (count - 1 - index) / (count - 1);
  } else if (from === 'center') {
    const center = (count - 1) / 2;
    normalizedPosition = Math.abs(index - center) / center;
  } else {
    // from is a numeric index: distance from the specified origin
    const origin = Math.max(0, Math.min(from, count - 1));
    const maxDistance = Math.max(origin, count - 1 - origin);
    normalizedPosition = maxDistance > 0 ? Math.abs(index - origin) / maxDistance : 0;
  }
  const eased = staggerEase !== undefined ? staggerEase(normalizedPosition) : normalizedPosition;
  return eased * each * (count - 1);
}
