import type { HasAppearance, HasAppearanceRuntime } from '@flighthq/types/contract';

// Resets the resolved-appearance cache for graph families that resolve appearance on the node (the 3D
// scene graph — see ensureNode3DWorldAlpha). The `-1` stamps are sentinels no live revision takes, so
// the first resolve always recomputes; `worldAppearanceId` starts at 0, the fresh-runtime value a
// child stores before its parent has ever resolved.
export function initAppearanceRuntimeTrait(target: HasAppearanceRuntime): void {
  target.worldAlpha = null;
  target.worldAlphaUsingAppearanceId = -1;
  target.worldAlphaUsingParentAppearanceId = -1;
  target.worldAppearanceId = 0;
}

export function initAppearanceTrait(target: HasAppearance, obj?: Readonly<Partial<HasAppearance>>): void {
  target.alpha = obj?.alpha ?? 1;
  target.visible = obj?.visible ?? true;
}
