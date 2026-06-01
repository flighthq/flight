import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render-core';
import { getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import type { DisplayObject, DisplayObjectRenderNode, DOMRenderState } from '@flighthq/types';

import { applyDOMClipRectangles, type DOMStageRectangle, pushDOMScrollRectangle } from './domClipRect';
import { pushDOMMaskRectangle } from './domMask';
import { detectDOMStructureChange, processDOMNode, reconcileDOMContainer, swapDOMOrderLists } from './domReconcile';
import type { DOMRenderStateInternal } from './internal';

export function renderDOMDisplayObject(state: DOMRenderState, source: DisplayObject): void {
  const internal = state as DOMRenderStateInternal;
  const container = state.element;

  let newLength = 0;
  let needsReconcile = false;
  const rectangles: DOMStageRectangle[] = [];

  const drawNode = (current: DisplayObject): void => {
    const data = getOrCreateDisplayObjectRenderNode(state, current);

    const isMask = data.isMaskFrameID === state.currentFrameID;
    if (isMask) return;

    const shouldRender = data.visible && data.alpha > 0 && (data.transform2D.a !== 0 || data.transform2D.d !== 0);
    if (!shouldRender) return;

    const pushed = pushDOMEffects(state, rectangles, data);

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
      applyDOMClipRectangles(internal, data, rectangles);
    }

    if (data.updateChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = 0; i < children.length; i++) {
          drawNode(children[i] as DisplayObject);
        }
      }
    }

    rectangles.length -= pushed;
  };

  drawNode(source);

  if (detectDOMStructureChange(internal, newLength, needsReconcile)) {
    reconcileDOMContainer(container, internal, newLength);
  }

  swapDOMOrderLists(internal, newLength);
}

function pushDOMEffects(state: DOMRenderState, rectangles: DOMStageRectangle[], data: DisplayObjectRenderNode): number {
  let pushed = 0;
  const source = data.source;
  if (source.scrollRect !== null) {
    pushDOMScrollRectangle(rectangles, data);
    pushed++;
  }
  if (source.mask !== null) {
    pushDOMMaskRectangle(rectangles, getOrCreateDisplayObjectRenderNode(state, source.mask));
    pushed++;
  }
  return pushed;
}
