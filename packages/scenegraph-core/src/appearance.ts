import type { BlendMode, ColorTransform, GraphAppearanceNode, Shader } from '@flighthq/types';

import { invalidateAppearance } from './revision';

export function setAppearanceAlpha<GraphKind extends symbol, Traits extends object>(
  target: GraphAppearanceNode<GraphKind, Traits>,
  value: number,
): void {
  target.alpha = value;
  invalidateAppearance(target);
}

export function setAppearanceBlendMode<GraphKind extends symbol, Traits extends object>(
  target: GraphAppearanceNode<GraphKind, Traits>,
  value: BlendMode | null,
): void {
  target.blendMode = value;
  invalidateAppearance(target);
}

export function setAppearanceColorTransform<GraphKind extends symbol, Traits extends object>(
  target: GraphAppearanceNode<GraphKind, Traits>,
  value: ColorTransform | null,
): void {
  target.colorTransform = value;
  invalidateAppearance(target);
}

export function setAppearanceShader<GraphKind extends symbol, Traits extends object>(
  target: GraphAppearanceNode<GraphKind, Traits>,
  value: Shader | null,
): void {
  target.shader = value;
  invalidateAppearance(target);
}

export function setAppearanceVisible<GraphKind extends symbol, Traits extends object>(
  target: GraphAppearanceNode<GraphKind, Traits>,
  value: boolean,
): void {
  target.visible = value;
  invalidateAppearance(target);
}
