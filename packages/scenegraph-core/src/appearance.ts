import type { BlendMode, ColorTransform, GraphNode, HasAppearance, Shader } from '@flighthq/types';

import { invalidateAppearance } from './revision';

export function setAppearanceAlpha<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasAppearance,
  value: number,
): void {
  source.alpha = value;
  invalidateAppearance(source);
}

export function setAppearanceBlendMode<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasAppearance,
  value: BlendMode | null,
): void {
  source.blendMode = value;
  invalidateAppearance(source);
}

export function setAppearanceColorTransform<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasAppearance,
  value: ColorTransform | null,
): void {
  source.colorTransform = value;
  invalidateAppearance(source);
}

export function setAppearanceShader<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasAppearance,
  value: Shader | null,
): void {
  source.shader = value;
  invalidateAppearance(source);
}

export function setAppearanceVisible<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasAppearance,
  value: boolean,
): void {
  source.visible = value;
  invalidateAppearance(source);
}
