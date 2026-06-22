import type {
  DomClipContourEntry,
  DomClipEntry,
  DomClipHooks,
  DomRenderState,
  DomStageRectangle,
  MatrixLike,
  RectangleLike,
  RenderProxy2D,
} from '@flighthq/types';

import { buildDomContourClipPath } from './domClipContours';
import { getDomRenderStateRuntime } from './domRenderState';

export function applyDomClipRectangles(
  state: DomRenderState,
  data: RenderProxy2D,
  entries: readonly DomClipEntry[],
): void {
  const element = getDomRenderStateRuntime(state).domElementMap.get(data);
  if (element === undefined) return;

  // CSS cannot intersect a path clip with other clips in one property. When a contour clip is active,
  // apply the deepest contour as the element's clip-path and ignore stacked rects for this element
  // (documented v1 limitation). Discriminate by the contour entry's `kind` tag; rects have none.
  let contour: DomClipContourEntry | null = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if ('kind' in entry) {
      contour = entry;
      break;
    }
  }
  if (contour !== null) {
    const mapPoint = createStageToElementPointMapper(element);
    const clipPath = buildDomContourClipPath(contour, mapPoint);
    element.style.clipPath = clipPath;
    (element.style as CSSStyleDeclaration & { webkitClipPath: string }).webkitClipPath = clipPath;
    return;
  }

  const rect = intersectDomStageRectangles(entries as readonly DomStageRectangle[]);
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

export function createDomStageRectangle(
  rect: Readonly<RectangleLike>,
  transform: Readonly<MatrixLike>,
): DomStageRectangle {
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

export function pushDomClipRectangle(
  stack: DomClipEntry[],
  rect: Readonly<RectangleLike>,
  transform: Readonly<MatrixLike>,
): void {
  stack.push(createDomStageRectangle(rect, transform));
}

export function setDomClipHooks(state: DomRenderState): void {
  const runtime = getDomRenderStateRuntime(state);
  if (runtime.domClipHooks === null) runtime.domClipHooks = domClipHooksImpl;
}

// Returns a closure mapping a stage-space point into `element`'s local space (the inverse of the
// element's CSS matrix), for placing contour clip-path points. Mirrors mapStageRectangleToElement's
// inverse but per-point, which contour clips need.
function createStageToElementPointMapper(element: HTMLElement): (x: number, y: number) => readonly [number, number] {
  const matrix = getElementMatrix(element);
  const det = matrix.a * matrix.d - matrix.b * matrix.c;
  if (det === 0) return () => [0, 0] as const;

  const invA = matrix.d / det;
  const invB = -matrix.b / det;
  const invC = -matrix.c / det;
  const invD = matrix.a / det;
  const invTx = (matrix.c * matrix.ty - matrix.d * matrix.tx) / det;
  const invTy = (matrix.b * matrix.tx - matrix.a * matrix.ty) / det;

  return (x, y) => [invA * x + invC * y + invTx, invB * x + invD * y + invTy] as const;
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

function intersectDomStageRectangles(rectangles: readonly DomStageRectangle[]): DomStageRectangle | null {
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

function mapStageRectangleToElement(rect: DomStageRectangle, element: HTMLElement): DomStageRectangle {
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

const domClipHooksImpl: DomClipHooks = {
  apply(state, data): void {
    applyDomClipRectangles(state, data, getDomRenderStateRuntime(state).domClipStack);
  },
};
