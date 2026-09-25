import { acquireMatrix, multiplyMatrix, releaseMatrix } from '@flighthq/geometry/contract';
import { getRenderProxy2D, isRenderProxyVisible, noopRendererData } from '@flighthq/render/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import type { DomRenderState, Matrix, Node2D, RenderProxy2D, Scene2DRenderer } from '@flighthq/types/contract';

import { hasDomStructureChanged, processDomNode, reconcileDomContainer, swapDomOrderLists } from './domReconcile.ts';
import { getDomRenderStateRuntime } from './domRenderState.ts';

export function drawDomScene2D(_state: DomRenderState, _renderProxy: RenderProxy2D): void {
  // No-op: containers are rendered implicitly by the traversal in renderDomScene2D.
}

export const domScene2DRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawDomScene2D,
};

export function renderDomScene2D(
  state: DomRenderState,
  source: Node2D,
  renderTransform?: Readonly<Matrix> | null,
): void {
  const runtime = getDomRenderStateRuntime(state);
  const container = state.element;
  const clipHooks = state.displayObjectClipHooks;
  const applyClip = runtime.domClipHooks;
  const frameId = runtime.currentFrameId;
  const tempStack = runtime.tempStack;
  const hasRenderTransform = renderTransform != null;
  const scratch = hasRenderTransform ? acquireMatrix() : null;

  let stackLength = 1;
  tempStack[0] = source;
  let newLength = 0;
  let needsReconcile = false;

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

    if (data.renderer !== null) {
      const result = processDomNode(runtime, data, frameId, () => data.renderer!.submit(state, data), newLength);
      newLength = result.newLength;
      if (result.needsReconcile) needsReconcile = true;
      applyClip?.apply(state, data);
    }
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

  if (hasDomStructureChanged(runtime, newLength, needsReconcile)) {
    reconcileDomContainer(container, runtime, newLength);
  }

  swapDomOrderLists(runtime, newLength);
}
