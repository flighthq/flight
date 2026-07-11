import type { HasColorTransform } from '@flighthq/types';

export function initColorTransformTrait(target: HasColorTransform, obj?: Readonly<Partial<HasColorTransform>>): void {
  target.colorTransform = obj?.colorTransform ?? null;
}
