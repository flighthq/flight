import type { HasAppearance } from '@flighthq/types';

export function initAppearanceTrait(target: HasAppearance, obj?: Readonly<Partial<HasAppearance>>): void {
  target.alpha = obj?.alpha ?? 1;
  target.blendMode = obj?.blendMode ?? null;
  target.colorTransform = obj?.colorTransform ?? null;
  target.shader = obj?.shader ?? null;
  target.visible = obj?.visible ?? true;
}
