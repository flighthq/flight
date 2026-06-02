import type { BlendMode, ColorTransform, GraphAppearanceNode, Shader } from '@flighthq/types';

import { invalidateAppearance } from './revision';

export function setAppearanceAlpha<SceneKind extends symbol, Traits extends object>(
  target: GraphAppearanceNode<SceneKind, Traits>,
  value: number,
): void {
  target.alpha = value;
  invalidateAppearance(target);
}

export function setAppearanceBlendMode<SceneKind extends symbol, Traits extends object>(
  target: GraphAppearanceNode<SceneKind, Traits>,
  value: BlendMode | null,
): void {
  target.blendMode = value;
  invalidateAppearance(target);
}

export function setAppearanceColorTransform<SceneKind extends symbol, Traits extends object>(
  target: GraphAppearanceNode<SceneKind, Traits>,
  value: ColorTransform | null,
): void {
  target.colorTransform = value;
  invalidateAppearance(target);
}

export function setAppearanceShader<SceneKind extends symbol, Traits extends object>(
  target: GraphAppearanceNode<SceneKind, Traits>,
  value: Shader | null,
): void {
  target.shader = value;
  invalidateAppearance(target);
}

export function setAppearanceVisible<SceneKind extends symbol, Traits extends object>(
  target: GraphAppearanceNode<SceneKind, Traits>,
  value: boolean,
): void {
  target.visible = value;
  invalidateAppearance(target);
}
