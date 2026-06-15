/* eslint-disable @typescript-eslint/no-explicit-any */

import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  EasingFunction,
  NumericProps,
  StopTweenOptions,
  Tween,
  TweenManager,
  TweenOptions,
  TweenPropertyDetail,
} from '@flighthq/types';

import { initializeTween } from './internal';
import { defaultManager } from './tweenManager';

export type { NumericProps, StopTweenOptions, Tween, TweenManager, TweenOptions } from '@flighthq/types';

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
  registerTween(manager, tween, options?.overwrite ?? true);
  return tween;
}

function isTweenManager(value: unknown): value is TweenManager {
  return typeof value === 'object' && value !== null && (value as any).__brand === 'TweenManager';
}

function makeTween<T extends object>(
  target: T,
  duration: number,
  propertyMap: Readonly<NumericProps<T>>,
  options: Readonly<TweenOptions> | undefined,
  defaultEase: EasingFunction,
): Tween<T> {
  const keys = Object.keys(propertyMap);
  const properties: TweenPropertyDetail[] = keys.map((key) => ({ change: 0, key, start: 0 }));
  return {
    complete: false,
    delay: options?.delay ?? 0,
    duration,
    ease: options?.ease ?? defaultEase,
    elapsed: 0,
    initialized: false,
    onComplete: createSignal(),
    onRepeat: createSignal(),
    onUpdate: createSignal(),
    paused: false,
    properties,
    propertyMap,
    reflect: options?.reflect ?? false,
    repeat: options?.repeat ?? 0,
    reverse: options?.reverse ?? false,
    smartRotation: options?.smartRotation ?? false,
    snapping: options?.snapping ?? false,
    target,
  };
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

function registerTween<T extends object>(manager: TweenManager, tween: Tween<T>, overwrite: boolean): void {
  let list = manager.tweens.get(tween.target);
  if (list === undefined) {
    list = [];
    manager.tweens.set(tween.target, list);
  }
  if (overwrite) {
    for (let i = list.length - 1; i >= 0; i--) {
      const existing = list[i];
      const existingMap = existing.propertyMap as Record<string, unknown>;
      let overlaps = false;
      for (const detail of tween.properties) {
        if (detail.key in existingMap) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) existing.complete = true;
    }
  }
  list.push(tween);
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

export function stopAllTweens(manager: TweenManager): void {
  for (const list of manager.tweens.values()) {
    for (const tween of list) tween.complete = true;
  }
}

export function stopTweens(
  manager: TweenManager,
  target: object,
  propertyMap?: Readonly<NumericProps<any>>,
  options?: Readonly<StopTweenOptions>,
): void {
  const list = manager.tweens.get(target);
  if (list === undefined) return;

  const doComplete = options?.complete ?? false;
  const doSendEvent = options?.sendEvent ?? true;

  for (const tween of list) {
    if (propertyMap !== undefined) {
      const p = propertyMap as Record<string, unknown>;
      const tweenMap = tween.propertyMap as Record<string, unknown>;
      let overlaps = false;
      for (const key of Object.keys(p)) {
        if (key in tweenMap) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) continue;
    }

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
}
