import { acquireMatrix, multiplyMatrix, releaseMatrix } from '@flighthq/geometry/contract';
import { getRenderProxy2D, isRenderProxyVisible, noopRendererData } from '@flighthq/render/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import type {
  CanvasRenderPass,
  CanvasRenderState,
  Matrix,
  Node2D,
  RenderProxy2D,
  Scene2DRenderer,
} from '@flighthq/types/contract';

import { resolveCanvasCssFilter } from './canvasCSSFilterBinding.ts';
import { getCanvasRenderStateRuntime } from './canvasRenderState.ts';

export function drawCanvasScene2D(_state: CanvasRenderState, _renderProxy: RenderProxy2D): void {
  // Plain display objects have no visual geometry of their own.
}

export const canvasScene2DRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawCanvasScene2D,
};

// Draws `source`'s subtree into the pass. The pass names the target, so the same scene renders to the
// screen or into an offscreen canvas with no argument but this one changing. When `renderTransform` is
// provided it is composed with each proxy's scene-space transform during the walk, applying the
// observation (camera, DPI, offscreen projection) without baking it into the prepare pass.
export function renderCanvasScene2D(
  pass: CanvasRenderPass,
  source: Node2D,
  renderTransform?: Readonly<Matrix> | null,
): void {
  const state = pass.state;
  const tempStack = getCanvasRenderStateRuntime(state).tempStack;
  const clipHooks = state.displayObjectClipHooks;
  const hasRenderTransform = renderTransform != null;
  const scratch = hasRenderTransform ? acquireMatrix() : null;

  let stackLength = 1;
  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as Node2D;
    if (!current.enabled) continue;

    const data = getRenderProxy2D(state, current);
    if (data === undefined) continue;

    const savedTransform = data.transform2D;
    if (hasRenderTransform) {
      multiplyMatrix(scratch!, renderTransform, savedTransform);
      data.transform2D = scratch!;
    }

    clipHooks?.popClip(state, data, current);

    if (!isRenderProxyVisible(data)) {
      if (hasRenderTransform) data.transform2D = savedTransform;
      continue;
    }
    if (isCanvasTransformDegenerate(data)) {
      if (hasRenderTransform) data.transform2D = savedTransform;
      continue;
    }

    clipHooks?.pushClip(state, data, current);

    const filter = resolveCanvasCssFilter(state, data);
    if (filter !== null) state.context.filter = filter;
    if (data.renderer !== null) data.renderer.submit(state, data);
    if (filter !== null) state.context.filter = 'none';
    if (data.traverseChildren) {
      const children = getNode2DRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as Node2D;
        }
      }
    }

    if (hasRenderTransform) data.transform2D = savedTransform;
  }

  if (scratch !== null) releaseMatrix(scratch);
  clipHooks?.finalize(state);
}

function isCanvasTransformDegenerate(data: RenderProxy2D): boolean {
  const t = data.transform2D;
  return t.a * t.d - t.b * t.c === 0;
}
