import type { HasAppearance } from '@flighthq/types/contract';

export function initAppearanceTrait(target: HasAppearance, obj?: Readonly<Partial<HasAppearance>>): void {
  target.alpha = obj?.alpha ?? 1;
  target.visible = obj?.visible ?? true;
}
