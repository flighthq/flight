import type { Tween } from '@flighthq/types';

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
