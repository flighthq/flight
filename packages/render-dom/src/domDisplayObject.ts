import { getOrCreateDisplayObjectRenderNode, isRenderNodeVisible } from '@flighthq/render';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type { DisplayObject, DOMRenderState } from '@flighthq/types';

import { detectDOMStructureChange, processDOMNode, reconcileDOMContainer, swapDOMOrderLists } from './domReconcile';
import type { DOMRenderStateInternal } from './internal';

export function renderDOMDisplayObject(state: DOMRenderState, source: DisplayObject): void {
  const internal = state as DOMRenderStateInternal;
  const container = state.element;
  const hooks = internal.domClipHooks;
  const frameID = state.currentFrameID;
  const tempStack = state.tempStack;

  let stackLength = 1;
  tempStack[0] = source;

  let newLength = 0;
  let needsReconcile = false;

  const pendingClips: DOMClipAction[] = [];

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;

    if (!current.enabled) {
      drainDOMClips(state, hooks, pendingClips, stackLength);
      continue;
    }

    const data = getOrCreateDisplayObjectRenderNode(state, current);

    if (data.isMaskFrameID === frameID) {
      drainDOMClips(state, hooks, pendingClips, stackLength);
      continue;
    }

    if (!isRenderNodeVisible(data)) {
      drainDOMClips(state, hooks, pendingClips, stackLength);
      continue;
    }

    let pushed = 0;
    if (hooks !== null) pushed = hooks.push(state, data);

    if (data.renderer !== null) {
      const result = processDOMNode(internal, data, frameID, () => data.renderer!.draw(state, data), newLength);
      newLength = result.newLength;
      if (result.needsReconcile) needsReconcile = true;
      if (hooks !== null) hooks.apply(state, data);
    }

    const prePushLength = stackLength;

    if (data.traverseChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }

    if (pushed > 0) {
      pendingClips.push({ atStackLength: prePushLength, count: pushed });
    }

    drainDOMClips(state, hooks, pendingClips, stackLength);
  }

  for (let i = pendingClips.length - 1; i >= 0; i--) {
    hooks!.pop(state, pendingClips[i].count);
  }

  if (detectDOMStructureChange(internal, newLength, needsReconcile)) {
    reconcileDOMContainer(container, internal, newLength);
  }

  swapDOMOrderLists(internal, newLength);
}

interface DOMClipAction {
  atStackLength: number;
  count: number;
}

function drainDOMClips(
  state: DOMRenderState,
  hooks: DOMRenderStateInternal['domClipHooks'],
  pendingClips: DOMClipAction[],
  stackLength: number,
): void {
  while (pendingClips.length > 0) {
    const top = pendingClips[pendingClips.length - 1];
    if (top.atStackLength < stackLength) break;
    pendingClips.pop();
    hooks!.pop(state, top.count);
  }
}
