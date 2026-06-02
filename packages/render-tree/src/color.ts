import { concatColorTransform, copyColorTransform, isIdentityColorTransform } from '@flighthq/materials';
import type { ColorTransform, HasAppearance, RenderState, RenderTreeNode } from '@flighthq/types';

export function updateRenderNodeColorTransform(
  state: RenderState,
  data: RenderTreeNode,
  parentData?: RenderTreeNode,
): void {
  const source = data.source as HasAppearance;
  const transform = source.colorTransform ?? null;
  let parentTransform = null;
  if (parentData !== undefined) {
    if (parentData.useColorTransform) {
      parentTransform = parentData.colorTransform;
    }
  } else {
    if (state.renderColorTransform !== null) {
      parentTransform = state.renderColorTransform;
    }
  }
  data.useColorTransform = recalculateColorTransform(data.colorTransform, transform, parentTransform);
}

function recalculateColorTransform(
  out: ColorTransform,
  transform: Readonly<ColorTransform> | null,
  parentTransform: Readonly<ColorTransform> | null,
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
