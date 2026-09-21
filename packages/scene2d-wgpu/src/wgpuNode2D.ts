import { acquireMatrix, multiplyMatrix, releaseMatrix } from '@flighthq/geometry/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { getRenderProxy2D, isRenderProxyVisible, noopRendererData } from '@flighthq/render/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import type {
  Matrix,
  Node2D,
  RenderProxy2D,
  Scene2DRenderer,
  WgpuRenderPass,
  WgpuRenderState,
} from '@flighthq/types/contract';

import { flushWgpuQuadBatchWriter } from './wgpuQuadBatchWriter';

export function drawWgpuScene2D(_state: WgpuRenderState, _renderProxy: RenderProxy2D): void {
  // Plain display objects have no visual geometry of their own.
}

export function renderWgpuScene2D(
  pass: WgpuRenderPass,
  source: Node2D,
  renderTransform?: Readonly<Matrix> | null,
): void {
  const state = pass.state;
  const tempStack = getWgpuRenderStateRuntime(state).tempStack;
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

    clipHooks?.pushClip(state, data, current);

    data.renderer?.submit(state, data);
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
  flushWgpuQuadBatchWriter(state);
  clipHooks?.finalize(state);
}

export const wgpuScene2DRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawWgpuScene2D,
};
