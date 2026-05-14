import type { BlendMode, ColorTransform, GraphNode, HasAppearance, Shader } from '@flighthq/types';

import { invalidateAppearance } from './revision';

export function setAlpha<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasAppearance,
  value: number,
): void {
  source.alpha = value;
  invalidateAppearance(source);
}

export function setBlendMode<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasAppearance,
  value: BlendMode | null,
): void {
  source.blendMode = value;
  invalidateAppearance(source);
}

export function setColorTransform<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasAppearance,
  value: ColorTransform | null,
): void {
  source.colorTransform = value;
  invalidateAppearance(source);
}

export function setShader<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasAppearance,
  value: Shader | null,
): void {
  source.shader = value;
  invalidateAppearance(source);
}

export function setVisible<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasAppearance,
  value: boolean,
): void {
  source.visible = value;
  invalidateAppearance(source);
}
