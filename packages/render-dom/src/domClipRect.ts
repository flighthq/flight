import { enableRenderFeatures, hasRenderFeatures } from '@flighthq/render';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';
import type {
  DisplayObject,
  DisplayObjectRenderNode,
  DOMRenderState,
  MatrixLike,
  RectangleLike,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import type { DOMClipHooks, DOMRenderStateInternal } from './internal';

export interface DOMStageRectangle {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export function applyDOMClipRectangles(
  state: DOMRenderStateInternal,
  data: DisplayObjectRenderNode,
  rectangles: readonly DOMStageRectangle[],
): void {
  const element = state.domElementMap.get(data);
  if (element === undefined) return;

  const rect = intersectDOMStageRectangles(rectangles);
  if (rect === null) {
    element.style.clipPath = '';
    (element.style as CSSStyleDeclaration & { webkitClipPath: string }).webkitClipPath = '';
    return;
  }

  if (rect.right <= rect.left || rect.bottom <= rect.top) {
    element.style.clipPath = EMPTY_CLIP_PATH;
    (element.style as CSSStyleDeclaration & { webkitClipPath: string }).webkitClipPath = EMPTY_CLIP_PATH;
    return;
  }

  const local = mapStageRectangleToElement(rect, element);
  const clipPath = `polygon(${local.left}px ${local.top}px, ${local.right}px ${local.top}px, ${local.right}px ${local.bottom}px, ${local.left}px ${local.bottom}px)`;
  element.style.clipPath = clipPath;
  (element.style as CSSStyleDeclaration & { webkitClipPath: string }).webkitClipPath = clipPath;
}

export function createDOMStageRectangle(
  rect: Readonly<RectangleLike>,
  transform: Readonly<MatrixLike>,
): DOMStageRectangle {
  const x0 = transform.a * rect.x + transform.c * rect.y + transform.tx;
  const y0 = transform.b * rect.x + transform.d * rect.y + transform.ty;
  const x1 = transform.a * (rect.x + rect.width) + transform.c * rect.y + transform.tx;
  const y1 = transform.b * (rect.x + rect.width) + transform.d * rect.y + transform.ty;
  const x2 = transform.a * rect.x + transform.c * (rect.y + rect.height) + transform.tx;
  const y2 = transform.b * rect.x + transform.d * (rect.y + rect.height) + transform.ty;
  const x3 = transform.a * (rect.x + rect.width) + transform.c * (rect.y + rect.height) + transform.tx;
  const y3 = transform.b * (rect.x + rect.width) + transform.d * (rect.y + rect.height) + transform.ty;

  return {
    bottom: Math.max(y0, y1, y2, y3),
    left: Math.min(x0, x1, x2, x3),
    right: Math.max(x0, x1, x2, x3),
    top: Math.min(y0, y1, y2, y3),
  };
}

export function enableDOMScrollRectangleSupport(state: DOMRenderState): void {
  enableRenderFeatures(state, RenderFeatures.ScrollRectangle);
  setDOMClipHooks(state);
}

export function pushDOMClipRectangle(
  rectangles: DOMStageRectangle[],
  rect: Readonly<RectangleLike>,
  transform: Readonly<MatrixLike>,
): void {
  rectangles.push(createDOMStageRectangle(rect, transform));
}

export function pushDOMScrollRectangle(rectangles: DOMStageRectangle[], data: DisplayObjectRenderNode): void {
  const rect = (data.source as DisplayObject).scrollRectangle!;
  const m = data.transform2D;
  // data.transform2D has the scroll offset (-rect.x, -rect.y) baked in by
  // updateDisplayObjectRenderTransform. Recover the pre-scroll world transform so that the
  // clip rectangle is placed correctly in stage space.
  const preScrollTransform = {
    a: m.a,
    b: m.b,
    c: m.c,
    d: m.d,
    tx: m.tx + m.a * rect.x + m.c * rect.y,
    ty: m.ty + m.b * rect.x + m.d * rect.y,
  };
  pushDOMClipRectangle(rectangles, rect, preScrollTransform);
}

export function setDOMClipHooks(state: DOMRenderState): void {
  const internal = state as DOMRenderStateInternal;
  if (internal.domClipHooks === null) internal.domClipHooks = domClipHooksImpl;
}

function getElementMatrix(element: HTMLElement): MatrixLike {
  const transform = element.style.transform;
  const match = /^matrix\(([^)]+)\)$/.exec(transform);
  if (match === null) {
    return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  }

  const parts = match[1].split(',').map((value) => Number(value.trim()));
  return {
    a: parts[0] ?? 1,
    b: parts[1] ?? 0,
    c: parts[2] ?? 0,
    d: parts[3] ?? 1,
    tx: parts[4] ?? 0,
    ty: parts[5] ?? 0,
  };
}

function intersectDOMStageRectangles(rectangles: readonly DOMStageRectangle[]): DOMStageRectangle | null {
  if (rectangles.length === 0) return null;

  let left = -Infinity;
  let top = -Infinity;
  let right = Infinity;
  let bottom = Infinity;

  for (const rect of rectangles) {
    if (rect.left > left) left = rect.left;
    if (rect.top > top) top = rect.top;
    if (rect.right < right) right = rect.right;
    if (rect.bottom < bottom) bottom = rect.bottom;
  }

  return { bottom, left, right, top };
}

function mapStageRectangleToElement(rect: DOMStageRectangle, element: HTMLElement): DOMStageRectangle {
  const matrix = getElementMatrix(element);
  const det = matrix.a * matrix.d - matrix.b * matrix.c;
  if (det === 0) return { bottom: 0, left: 0, right: 0, top: 0 };

  const invA = matrix.d / det;
  const invB = -matrix.b / det;
  const invC = -matrix.c / det;
  const invD = matrix.a / det;
  const invTx = (matrix.c * matrix.ty - matrix.d * matrix.tx) / det;
  const invTy = (matrix.b * matrix.tx - matrix.a * matrix.ty) / det;

  const x0 = invA * rect.left + invC * rect.top + invTx;
  const y0 = invB * rect.left + invD * rect.top + invTy;
  const x1 = invA * rect.right + invC * rect.top + invTx;
  const y1 = invB * rect.right + invD * rect.top + invTy;
  const x2 = invA * rect.left + invC * rect.bottom + invTx;
  const y2 = invB * rect.left + invD * rect.bottom + invTy;
  const x3 = invA * rect.right + invC * rect.bottom + invTx;
  const y3 = invB * rect.right + invD * rect.bottom + invTy;

  return {
    bottom: Math.max(y0, y1, y2, y3),
    left: Math.min(x0, x1, x2, x3),
    right: Math.max(x0, x1, x2, x3),
    top: Math.min(y0, y1, y2, y3),
  };
}

const EMPTY_CLIP_PATH = 'inset(0 100% 100% 0)';

const domClipHooksImpl: DOMClipHooks = {
  push(state: DOMRenderState, data: DisplayObjectRenderNode): number {
    const internal = state as DOMRenderStateInternal;
    const stack = internal.domClipStack;
    let pushed = 0;
    const source = data.source as DisplayObject;
    if (source.scrollRectangle !== null && hasRenderFeatures(state, RenderFeatures.ScrollRectangle)) {
      pushDOMScrollRectangle(stack, data);
      pushed++;
    }
    if (source.mask !== null) {
      const maskHooks = state.displayObjectMaskHooks;
      if (maskHooks !== null) {
        maskHooks.pushMask(state, getOrCreateDisplayObjectRenderNode(state, source.mask), stack);
        pushed++;
      }
    }
    return pushed;
  },
  apply(state: DOMRenderState, data: DisplayObjectRenderNode): void {
    const internal = state as DOMRenderStateInternal;
    applyDOMClipRectangles(internal, data, internal.domClipStack);
  },
  pop(state: DOMRenderState, pushed: number): void {
    (state as DOMRenderStateInternal).domClipStack.length -= pushed;
  },
};
