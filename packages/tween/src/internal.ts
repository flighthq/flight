import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createSignal } from '@flighthq/signals/contract';
import type {
  EasingFunction,
  NumericProps,
  Tween,
  TweenManager,
  TweenOptions,
  TweenPropertyDetail,
} from '@flighthq/types/contract';

export function addTweenToManager<T extends object>(
  manager: TweenManager,
  tween: Tween<T>,
  overwrite: boolean,
  registrationTarget: object = tween.target,
  registrationPropertyKeys?: readonly string[],
): void {
  if (registrationPropertyKeys !== undefined) {
    _registrationPropertyKeys.set(tween, registrationPropertyKeys);
  }

  let list = manager.tweens.get(registrationTarget);
  if (list === undefined) {
    list = [];
    manager.tweens.set(registrationTarget, list);
  }
  if (overwrite) {
    for (let i = list.length - 1; i >= 0; i--) {
      const existing = list[i];
      let overlaps = false;
      if (registrationPropertyKeys === undefined) {
        for (const detail of tween.properties) {
          if (hasTweenProperty(existing, detail.key)) {
            overlaps = true;
            break;
          }
        }
      } else {
        for (const key of registrationPropertyKeys) {
          if (hasTweenProperty(existing, key)) {
            overlaps = true;
            break;
          }
        }
      }
      if (overlaps) existing.complete = true;
    }
  }
  list.push(tween);
}

export function hasTweenProperty<T extends object>(tween: Tween<T>, key: string): boolean {
  const registrationPropertyKeys = _registrationPropertyKeys.get(tween);
  if (registrationPropertyKeys !== undefined) return registrationPropertyKeys.includes(key);
  return key in tween.propertyMap;
}

export function initializeTween<T extends object>(tween: Tween<T>): void {
  const target = tween.target as Record<string, number>;
  const propertyMap = tween.propertyMap as Record<string, number>;
  for (const detail of tween.properties) {
    const start = target[detail.key] ?? 0;
    const end = propertyMap[detail.key] ?? 0;
    detail.start = start;
    detail.change = end - start;
    if (tween.smartRotation) {
      let change = ((detail.change % 360) + 360) % 360;
      if (change > 180) change -= 360;
      detail.change = change;
    }
  }
  tween.initialized = true;
}

export function makeTween<T extends object>(
  target: T,
  duration: number,
  propertyMap: Readonly<NumericProps<T>>,
  options: Readonly<TweenOptions> | undefined,
  defaultEase: EasingFunction,
): Tween<T> {
  const keys = Object.keys(propertyMap);
  const properties: TweenPropertyDetail[] = keys.map((key) => ({ change: 0, key, start: 0 }));
  const out = allocateEntity<Tween<T>>();
  out.complete = false;
  out.delay = options?.delay ?? 0;
  out.duration = duration;
  out.ease = options?.ease ?? defaultEase;
  out.elapsed = 0;
  out.initialized = false;
  out.onComplete = createSignal();
  out.onRepeat = createSignal();
  out.onUpdate = createSignal();
  out.onYoyo = createSignal();
  out.paused = false;
  out.properties = properties;
  out.propertyMap = propertyMap;
  out.reflect = options?.reflect ?? false;
  out.repeat = options?.repeat ?? 0;
  out.reverse = options?.reverse ?? false;
  out.smartRotation = options?.smartRotation ?? false;
  out.snapping = options?.snapping ?? false;
  out.target = target;
  return finishEntity(out);
}

// Proxy-backed tweens interpolate against their private target while manager operations address the
// caller's property. The weak key keeps that registration identity attached to the tween without
// widening the public Tween shape or retaining completed tweens.
const _registrationPropertyKeys = new WeakMap<object, readonly string[]>();
