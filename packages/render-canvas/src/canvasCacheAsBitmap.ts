import { createMatrix, multiplyMatrix } from '@flighthq/geometry';
import type { CanvasRenderState, DisplayObjectRenderNode, ImageCacheResult } from '@flighthq/types';

import { setCanvasTransform } from './canvasTransform';

const _tempDrawTransform = createMatrix();

export function drawImageCacheResult(
  state: CanvasRenderState,
  renderNode: DisplayObjectRenderNode,
  cache: ImageCacheResult,
): void {
  if (cache.canvas === null) return;
  multiplyMatrix(_tempDrawTransform, renderNode.transform2D, cache.transform);
  setCanvasTransform(state, state.context, _tempDrawTransform);
  state.context.drawImage(cache.canvas, 0, 0);
}
