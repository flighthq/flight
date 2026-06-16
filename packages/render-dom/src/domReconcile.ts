import type { RenderNode2D } from '@flighthq/types';

import type { DOMRenderStateInternal } from './internal';

export function hasDOMStructureChanged(
  internal: DOMRenderStateInternal,
  newLength: number,
  needsReconcile: boolean,
): boolean {
  if (needsReconcile) return true;
  if (newLength !== internal.domOrderLength) return true;
  for (let i = 0; i < newLength; i++) {
    if (internal.domNextOrderList[i] !== internal.domOrderList[i]) return true;
  }
  return false;
}

export function processDOMNode(
  internal: DOMRenderStateInternal,
  data: RenderNode2D,
  currentFrameID: number,
  drawFn: () => void,
  newLength: number,
  forceDraw = false,
): { newLength: number; needsReconcile: boolean } {
  const isNew = !internal.domElementMap.has(data);
  const appearanceDirty = data.appearanceFrameID === currentFrameID;
  const transformDirty = data.transformFrameID === currentFrameID;
  let needsReconcile = false;

  if (isNew || appearanceDirty || transformDirty || forceDraw) {
    const prevElement = isNew ? undefined : internal.domElementMap.get(data);
    internal.domCurrentElement = null;
    drawFn();
    const newElement = internal.domCurrentElement;
    if (newElement !== null) {
      internal.domElementMap.set(data, newElement);
      if (newElement !== prevElement) needsReconcile = true;
    } else if (prevElement !== undefined) {
      internal.domElementMap.delete(data);
      needsReconcile = true;
    }
  }

  if (newLength >= internal.domNextOrderList.length) {
    internal.domNextOrderList.length = newLength + 16;
  }
  internal.domNextOrderList[newLength] = data;

  return { newLength: newLength + 1, needsReconcile };
}

export function reconcileDOMContainer(
  container: HTMLElement,
  internal: DOMRenderStateInternal,
  newLength: number,
): void {
  const keepSet = new Set<HTMLElement>();
  for (let i = 0; i < newLength; i++) {
    const el = internal.domElementMap.get(internal.domNextOrderList[i]);
    if (el !== undefined) keepSet.add(el);
  }

  let child = container.firstChild;
  while (child !== null) {
    const next = child.nextSibling;
    if (!keepSet.has(child as HTMLElement)) container.removeChild(child);
    child = next;
  }

  let nextSibling: Node | null = null;
  for (let i = newLength - 1; i >= 0; i--) {
    const el = internal.domElementMap.get(internal.domNextOrderList[i]);
    if (el === undefined) continue;
    if (el.nextSibling !== nextSibling || el.parentNode !== container) {
      container.insertBefore(el, nextSibling);
    }
    nextSibling = el;
  }
}

export function swapDOMOrderLists(internal: DOMRenderStateInternal, newLength: number): void {
  const prevList = internal.domOrderList;
  internal.domOrderList = internal.domNextOrderList;
  internal.domOrderLength = newLength;
  internal.domNextOrderList = prevList;
}
