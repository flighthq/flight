import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render-tree';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type { DisplayObject, DOMRenderState } from '@flighthq/types';

import { detectDOMStructureChange, processDOMNode, reconcileDOMContainer, swapDOMOrderLists } from './domReconcile';
import type { DOMRenderStateInternal } from './internal';

export function renderDOMDisplayObject(state: DOMRenderState, source: DisplayObject): void {
  const internal = state as DOMRenderStateInternal;
  const container = state.element;
  const hooks = internal.domClipHooks;

  let newLength = 0;
  let needsReconcile = false;

  const drawNode = (current: DisplayObject): void => {
    const data = getOrCreateDisplayObjectRenderNode(state, current);

    const isMask = data.isMaskFrameID === state.currentFrameID;
    if (isMask) return;

    const shouldRender = data.visible && data.alpha > 0 && (data.transform2D.a !== 0 || data.transform2D.d !== 0);
    if (!shouldRender) return;

    let pushed = 0;
    if (hooks !== null) pushed = hooks.push(state, data);

    if (data.renderer !== null) {
      const result = processDOMNode(
        internal,
        data,
        state.currentFrameID,
        () => data.renderer!.draw(state, data),
        newLength,
      );
      newLength = result.newLength;
      if (result.needsReconcile) needsReconcile = true;
      if (hooks !== null) hooks.apply(state, data);
    }

    if (data.updateChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = 0; i < children.length; i++) {
          drawNode(children[i] as DisplayObject);
        }
      }
    }

    if (pushed > 0) hooks!.pop(state, pushed);
  };

  drawNode(source);

  if (detectDOMStructureChange(internal, newLength, needsReconcile)) {
    reconcileDOMContainer(container, internal, newLength);
  }

  swapDOMOrderLists(internal, newLength);
}
