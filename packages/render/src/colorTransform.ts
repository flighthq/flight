import {
  concatColorTransform,
  copyColorTransform,
  createColorTransform,
  isIdentityColorTransform,
} from '@flighthq/materials';
import type { AppearanceHooks, ColorTransformLike, HasAppearance, RenderNode, RenderState } from '@flighthq/types';

export function enableColorTransformSupport(state: RenderState): void {
  state.appearanceHooks = colorTransformAppearanceHooks;
}

export function updateRenderNodeColorTransform(state: RenderState, data: RenderNode, parentData?: RenderNode): void {
  data.colorTransform ??= createColorTransform();
  const source = data.source as HasAppearance;
  const transform = source.colorTransform ?? null;
  let parentTransform: ColorTransformLike | null = null;
  if (parentData !== undefined) {
    if (parentData.useColorTransform) parentTransform = parentData.colorTransform;
  } else {
    if (state.renderColorTransform !== null) parentTransform = state.renderColorTransform;
  }
  data.useColorTransform = recalculateColorTransform(data.colorTransform, transform, parentTransform);
}

function recalculateColorTransform(
  out: ColorTransformLike,
  transform: Readonly<ColorTransformLike> | null,
  parentTransform: Readonly<ColorTransformLike> | null,
): boolean {
  if (parentTransform !== null && !isIdentityColorTransform(parentTransform)) {
    if (transform !== null) {
      concatColorTransform(out, transform, parentTransform);
    } else {
      copyColorTransform(out, parentTransform);
    }
    return true;
  } else if (transform !== null && !isIdentityColorTransform(transform)) {
    copyColorTransform(out, transform);
    return true;
  }
  return false;
}

const colorTransformAppearanceHooks: AppearanceHooks = {
  update(state: RenderState, data: RenderNode, parentData: RenderNode | undefined): void {
    updateRenderNodeColorTransform(state, data, parentData);
  },
};
