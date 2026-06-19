import type { DOMRenderStateRuntime, RenderProxy2D } from '@flighthq/types';

export function hasDOMStructureChanged(
  runtime: DOMRenderStateRuntime,
  newLength: number,
  needsReconcile: boolean,
): boolean {
  if (needsReconcile) return true;
  if (newLength !== runtime.domOrderLength) return true;
  for (let i = 0; i < newLength; i++) {
    if (runtime.domNextOrderList[i] !== runtime.domOrderList[i]) return true;
  }
  return false;
}

export function processDOMNode(
  runtime: DOMRenderStateRuntime,
  data: RenderProxy2D,
  currentFrameID: number,
  drawFn: () => void,
  newLength: number,
  forceDraw = false,
): { newLength: number; needsReconcile: boolean } {
  const isNew = !runtime.domElementMap.has(data);
  const appearanceDirty = data.appearanceFrameID === currentFrameID;
  const transformDirty = data.transformFrameID === currentFrameID;
  let needsReconcile = false;

  if (isNew || appearanceDirty || transformDirty || forceDraw) {
    const prevElement = isNew ? undefined : runtime.domElementMap.get(data);
    runtime.domCurrentElement = null;
    drawFn();
    const newElement = runtime.domCurrentElement;
    if (newElement !== null) {
      runtime.domElementMap.set(data, newElement);
      if (newElement !== prevElement) needsReconcile = true;
    } else if (prevElement !== undefined) {
      runtime.domElementMap.delete(data);
      needsReconcile = true;
    }
  }

  if (newLength >= runtime.domNextOrderList.length) {
    runtime.domNextOrderList.length = newLength + 16;
  }
  runtime.domNextOrderList[newLength] = data;

  return { newLength: newLength + 1, needsReconcile };
}

export function reconcileDOMContainer(container: HTMLElement, runtime: DOMRenderStateRuntime, newLength: number): void {
  const keepSet = new Set<HTMLElement>();
  for (let i = 0; i < newLength; i++) {
    const el = runtime.domElementMap.get(runtime.domNextOrderList[i]);
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
    const el = runtime.domElementMap.get(runtime.domNextOrderList[i]);
    if (el === undefined) continue;
    if (el.nextSibling !== nextSibling || el.parentNode !== container) {
      container.insertBefore(el, nextSibling);
    }
    nextSibling = el;
  }
}

export function swapDOMOrderLists(runtime: DOMRenderStateRuntime, newLength: number): void {
  const prevList = runtime.domOrderList;
  runtime.domOrderList = runtime.domNextOrderList;
  runtime.domOrderLength = newLength;
  runtime.domNextOrderList = prevList;
}
