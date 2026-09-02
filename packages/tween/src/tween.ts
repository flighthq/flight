/* eslint-disable @typescript-eslint/no-explicit-any */

import { emitSignal } from '@flighthq/signals/contract';
import type { NumericProps, StopTweenOptions, Tween, TweenManager, TweenOptions } from '@flighthq/types/contract';

import { addTweenToManager, hasTweenProperty, initializeTween, makeTween } from './internal';
import { defaultManager } from './tweenManager';

export function applyTween<T extends object>(
  manager: TweenManager,
  target: T,
  propertyMap: Readonly<NumericProps<T>>,
): void {
  stopTweens(manager, target, propertyMap);
  const t = target as Record<string, number>;
  const p = propertyMap as Record<string, number | undefined>;
  for (const key of Object.keys(p)) {
    const val = p[key];
    if (val !== undefined) t[key] = val;
  }
}

// `duration` (and `options.delay`) are unit-agnostic: they are expressed in the
// same unit the caller later feeds `updateTweens(manager, deltaTime)`. The
// package performs no time conversion, so seconds, milliseconds, and frames are
// all valid as long as duration and `deltaTime` use one consistent unit.
export function createTween<T extends object>(
  manager: TweenManager,
  target: T,
  duration: number,
  propertyMap: Readonly<NumericProps<T>>,
  options?: Readonly<TweenOptions>,
): Tween<T>;
export function createTween<T extends object>(
  target: T,
  duration: number,
  propertyMap: Readonly<NumericProps<T>>,
  options?: Readonly<TweenOptions>,
): Tween<T>;
export function createTween<T extends object>(
  managerOrTarget: TweenManager | T,
  targetOrDuration: T | number,
  durationOrProps: number | Readonly<NumericProps<T>>,
  propsOrOptions?: Readonly<NumericProps<T>> | Readonly<TweenOptions>,
  maybeOptions?: Readonly<TweenOptions>,
): Tween<T> {
  let manager: TweenManager;
  let target: T;
  let duration: number;
  let propertyMap: Readonly<NumericProps<T>>;
  let options: Readonly<TweenOptions> | undefined;

  if (isTweenManager(managerOrTarget)) {
    manager = managerOrTarget;
    target = targetOrDuration as T;
    duration = durationOrProps as number;
    propertyMap = propsOrOptions as Readonly<NumericProps<T>>;
    options = maybeOptions;
  } else {
    manager = defaultManager;
    target = managerOrTarget as T;
    duration = targetOrDuration as number;
    propertyMap = durationOrProps as Readonly<NumericProps<T>>;
    options = propsOrOptions as Readonly<TweenOptions> | undefined;
  }

  const tween = makeTween(target, duration, propertyMap, options, manager.defaultEase);
  addTweenToManager(manager, tween, options?.overwrite ?? true);
  return tween;
}

export function getActiveTweenCount(manager: TweenManager): number {
  let count = 0;
  for (const list of manager.tweens.values()) count += list.length;
  return count;
}

export function getTweensOf(manager: TweenManager, target: object): readonly Tween<any>[] {
  return manager.tweens.get(target) ?? [];
}

export function hasTweensOf(manager: TweenManager, target: object): boolean {
  const list = manager.tweens.get(target);
  return list !== undefined && list.length > 0;
}

function isTweenManager(value: unknown): value is TweenManager {
  return typeof value === 'object' && value !== null && (value as any).__brand === 'TweenManager';
}

export function killTweensOfProperty(manager: TweenManager, key: string): void {
  for (const list of manager.tweens.values()) {
    for (const tween of list) {
      if (hasTweenProperty(tween, key)) tween.complete = true;
    }
  }
}

export function pauseAllTweens(manager: TweenManager): void {
  for (const list of manager.tweens.values()) {
    for (const tween of list) tween.paused = true;
  }
}

export function pauseTween(tween: Tween<any>): void {
  tween.paused = true;
}

export function pauseTweens(manager: TweenManager, target: object): void {
  const list = manager.tweens.get(target);
  if (list === undefined) return;
  for (const tween of list) tween.paused = true;
}

export function resetAllTweens(manager: TweenManager): void {
  manager.tweens.clear();
}

export function resumeAllTweens(manager: TweenManager): void {
  for (const list of manager.tweens.values()) {
    for (const tween of list) tween.paused = false;
  }
}

export function resumeTween(tween: Tween<any>): void {
  tween.paused = false;
}

export function resumeTweens(manager: TweenManager, target: object): void {
  const list = manager.tweens.get(target);
  if (list === undefined) return;
  for (const tween of list) tween.paused = false;
}

export function stopAllTweens(manager: TweenManager, options?: Readonly<StopTweenOptions>): void {
  for (const list of manager.tweens.values()) {
    for (const tween of list) stopTween(tween, options);
  }
}

export function stopTween(tween: Tween<any>, options?: Readonly<StopTweenOptions>): void {
  const doComplete = options?.complete ?? false;
  const doSendEvent = options?.sendEvent ?? true;

  if (doComplete) {
    if (!tween.initialized) initializeTween(tween);
    const effectiveT = tween.reverse ? 0 : 1;
    const easedT = tween.ease(effectiveT);
    const t = tween.target as Record<string, number>;
    for (const detail of tween.properties) {
      let value = detail.start + detail.change * easedT;
      if (tween.snapping) value = Math.round(value);
      t[detail.key] = value;
    }
    if (doSendEvent) emitSignal(tween.onComplete);
  }

  tween.complete = true;
}

export function stopTweens(
  manager: TweenManager,
  target: object,
  propertyMap?: Readonly<NumericProps<any>>,
  options?: Readonly<StopTweenOptions>,
): void {
  const list = manager.tweens.get(target);
  if (list === undefined) return;

  for (const tween of list) {
    if (propertyMap !== undefined) {
      const p = propertyMap as Record<string, unknown>;
      let overlaps = false;
      for (const key of Object.keys(p)) {
        if (hasTweenProperty(tween, key)) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) continue;
    }

    stopTween(tween, options);
  }
}
