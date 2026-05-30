import type { BlendMode, ColorTransform, GraphAppearanceNode, Shader } from '@flighthq/types';

import { invalidateAppearance } from './revision';

export function setAppearanceAlpha<GraphKind extends symbol, Traits extends object>(
  source: GraphAppearanceNode<GraphKind, Traits>,
  value: number,
): void {
  source.alpha = value;
  invalidateAppearance(source);
}

export function setAppearanceBlendMode<GraphKind extends symbol, Traits extends object>(
  source: GraphAppearanceNode<GraphKind, Traits>,
  value: BlendMode | null,
): void {
  source.blendMode = value;
  invalidateAppearance(source);
}

export function setAppearanceColorTransform<GraphKind extends symbol, Traits extends object>(
  source: GraphAppearanceNode<GraphKind, Traits>,
  value: ColorTransform | null,
): void {
  source.colorTransform = value;
  invalidateAppearance(source);
}

export function setAppearanceShader<GraphKind extends symbol, Traits extends object>(
  source: GraphAppearanceNode<GraphKind, Traits>,
  value: Shader | null,
): void {
  source.shader = value;
  invalidateAppearance(source);
}

export function setAppearanceVisible<GraphKind extends symbol, Traits extends object>(
  source: GraphAppearanceNode<GraphKind, Traits>,
  value: boolean,
): void {
  source.visible = value;
  invalidateAppearance(source);
}
