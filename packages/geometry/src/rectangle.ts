import { createEntity } from '@flighthq/entity/contract';
import type { Rectangle, RectangleLike, Vector2Like } from '@flighthq/types/contract';

export function cloneRectangle(source: Readonly<RectangleLike>): Rectangle {
  return createRectangle(source.x, source.y, source.width, source.height);
}

export function computeRectangleIntersection(
  out: RectangleLike,
  a: Readonly<RectangleLike>,
  b: Readonly<RectangleLike>,
): void {
  const x0 = Math.max(getRectangleMinX(a), getRectangleMinX(b));
  const x1 = Math.min(getRectangleMaxX(a), getRectangleMaxX(b));
  const y0 = Math.max(getRectangleMinY(a), getRectangleMinY(b));
  const y1 = Math.min(getRectangleMaxY(a), getRectangleMaxY(b));

  if (x1 <= x0 || y1 <= y0) {
    setEmptyRectangle(out);
    return;
  }

  out.x = x0;
  out.y = y0;
  out.width = x1 - x0;
  out.height = y1 - y0;
}

export function containsRectanglePoint(source: Readonly<RectangleLike>, vector: Readonly<Vector2Like>): boolean {
  return containsRectanglePointXY(source, vector.x, vector.y);
}

export function containsRectanglePointXY(source: Readonly<RectangleLike>, x: number, y: number): boolean {
  const x0 = Math.min(source.x, source.x + source.width);
  const x1 = Math.max(source.x, source.x + source.width);
  const y0 = Math.min(source.y, source.y + source.height);
  const y1 = Math.max(source.y, source.y + source.height);
  return x >= x0 && x < x1 && y >= y0 && y < y1;
}

export function copyRectangle(out: RectangleLike, source: Readonly<RectangleLike>): void {
  const x = source.x,
    y = source.y,
    width = source.width,
    height = source.height;
  out.x = x;
  out.y = y;
  out.width = width;
  out.height = height;
}

export function createRectangle(x?: number, y?: number, width?: number, height?: number): Rectangle {
  return createEntity({
    x: x ?? 0,
    y: y ?? 0,
    width: width ?? 0,
    height: height ?? 0,
  });
}

export function enclosesRectangle(source: Readonly<RectangleLike>, other: Readonly<RectangleLike>): boolean {
  const sx0 = Math.min(source.x, source.x + source.width);
  const sx1 = Math.max(source.x, source.x + source.width);
  const sy0 = Math.min(source.y, source.y + source.height);
  const sy1 = Math.max(source.y, source.y + source.height);

  const ox0 = Math.min(other.x, other.x + other.width);
  const ox1 = Math.max(other.x, other.x + other.width);
  const oy0 = Math.min(other.y, other.y + other.height);
  const oy1 = Math.max(other.y, other.y + other.height);

  // A rectangle contains another if all corners are inside (exclusive right/bottom)
  return ox0 >= sx0 && oy0 >= sy0 && ox1 <= sx1 && oy1 <= sy1;
}

export function equalsRectangle(
  a: Readonly<RectangleLike> | null | undefined,
  b: Readonly<RectangleLike> | null | undefined,
): boolean {
  if (!a || !b) return false;
  // Identity after the absence check, as in `equalsVector2`: a rectangle is equal to itself even
  // when a field is NaN, but two absences are two unknowns rather than one shared value.
  return a === b || (a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
}

export function expandRectangleToPoint(
  out: RectangleLike,
  sourceRect: Readonly<RectangleLike>,
  sourceVec2: Readonly<Vector2Like>,
): void {
  const minX = Math.min(sourceRect.x, sourceRect.x + sourceRect.width, sourceVec2.x);
  const maxX = Math.max(sourceRect.x, sourceRect.x + sourceRect.width, sourceVec2.x);
  const minY = Math.min(sourceRect.y, sourceRect.y + sourceRect.height, sourceVec2.y);
  const maxY = Math.max(sourceRect.y, sourceRect.y + sourceRect.height, sourceVec2.y);
  out.x = minX;
  out.y = minY;
  out.width = maxX - minX;
  out.height = maxY - minY;
}

export function getRectangleBottom(source: Readonly<RectangleLike>): number {
  return source.y + source.height;
}

/**
 * Sets a Vector2Like object with bottom-right coordinates
 */
export function getRectangleBottomRight(out: Vector2Like, source: Readonly<RectangleLike>): void {
  const x = source.x + source.width,
    y = source.y + source.height;
  out.x = x;
  out.y = y;
}

export function getRectangleLeft(source: Readonly<RectangleLike>): number {
  return source.x;
}

export function getRectangleMaxX(source: Readonly<RectangleLike>): number {
  return Math.max(source.x, source.x + source.width);
}

export function getRectangleMaxY(source: Readonly<RectangleLike>): number {
  return Math.max(source.y, source.y + source.height);
}

export function getRectangleMinX(source: Readonly<RectangleLike>): number {
  return Math.min(source.x, source.x + source.width);
}

export function getRectangleMinY(source: Readonly<RectangleLike>): number {
  return Math.min(source.y, source.y + source.height);
}

export function getRectangleNormalizedBottomRight(out: Vector2Like, source: Readonly<RectangleLike>): void {
  const x = getRectangleMaxX(source),
    y = getRectangleMaxY(source);
  out.x = x;
  out.y = y;
}

export function getRectangleNormalizedTopLeft(out: Vector2Like, source: Readonly<RectangleLike>): void {
  const x = getRectangleMinX(source),
    y = getRectangleMinY(source);
  out.x = x;
  out.y = y;
}

export function getRectangleRight(source: Readonly<RectangleLike>): number {
  return source.x + source.width;
}

/**
 * Sets a Vector2Like object to width and height
 */
export function getRectangleSize(out: Vector2Like, source: Readonly<RectangleLike>): void {
  const width = source.width,
    height = source.height;
  out.x = width;
  out.y = height;
}

export function getRectangleTop(source: Readonly<RectangleLike>): number {
  return source.y;
}

/**
 * Sets a Vector2Like object with top-left coordinates
 */
export function getRectangleTopLeft(out: Vector2Like, source: Readonly<RectangleLike>): void {
  const x = source.x,
    y = source.y;
  out.x = x;
  out.y = y;
}

export function inflateRectangle(out: RectangleLike, source: Readonly<RectangleLike>, dx: number, dy: number): void {
  const x = source.x,
    y = source.y,
    width = source.width,
    height = source.height;
  out.x = x - dx;
  out.width = width + dx * 2;
  out.y = y - dy;
  out.height = height + dy * 2;
}

export function intersectsRectangle(a: Readonly<RectangleLike>, b: Readonly<RectangleLike>): boolean {
  return !(
    getRectangleMaxX(a) <= getRectangleMinX(b) ||
    getRectangleMinX(a) >= getRectangleMaxX(b) ||
    getRectangleMaxY(a) <= getRectangleMinY(b) ||
    getRectangleMinY(a) >= getRectangleMaxY(b)
  );
}

/**
 * Returns true if width or height is 0
 *
 * Note: Negative width or height is considered valid
 */
export function isEmptyRectangle(source: Readonly<RectangleLike>): boolean {
  return source.width === 0 || source.height === 0;
}

export function isFlippedXRectangle(source: Readonly<RectangleLike>): boolean {
  return source.width < 0;
}

export function isFlippedYRectangle(source: Readonly<RectangleLike>): boolean {
  return source.height < 0;
}

export function mergeRectangle(
  out: RectangleLike,
  source: Readonly<RectangleLike>,
  other: Readonly<RectangleLike>,
): void {
  const { x: sx, y: sy, width: sw, height: sh } = source;
  const { x: ox, y: oy, width: ow, height: oh } = other;
  const sEmpty = sw === 0 || sh === 0;
  const oEmpty = ow === 0 || oh === 0;
  if (sEmpty || oEmpty) {
    if (oEmpty && source === out) return;
    out.x = oEmpty ? sx : ox;
    out.y = oEmpty ? sy : oy;
    out.width = oEmpty ? sw : ow;
    out.height = oEmpty ? sh : oh;
  } else {
    const sourceLeft = Math.min(sx, sx + sw);
    const sourceRight = Math.max(sx, sx + sw);
    const sourceTop = Math.min(sy, sy + sh);
    const sourceBottom = Math.max(sy, sy + sh);

    const otherLeft = Math.min(ox, ox + ow);
    const otherRight = Math.max(ox, ox + ow);
    const otherTop = Math.min(oy, oy + oh);
    const otherBottom = Math.max(oy, oy + oh);

    const x0 = Math.min(sourceLeft, otherLeft);
    const x1 = Math.max(sourceRight, otherRight);
    const y0 = Math.min(sourceTop, otherTop);
    const y1 = Math.max(sourceBottom, otherBottom);

    out.x = x0;
    out.y = y0;
    out.width = x1 - x0;
    out.height = y1 - y0;
  }
}

export function normalizeRectangle(out: RectangleLike, source: Readonly<RectangleLike>): void {
  const maxX = getRectangleMaxX(source);
  const maxY = getRectangleMaxY(source);
  const minX = getRectangleMinX(source);
  const minY = getRectangleMinY(source);
  out.x = minX;
  out.y = minY;
  out.width = maxX - minX;
  out.height = maxY - minY;
}

export function offsetRectangle(out: RectangleLike, source: Readonly<RectangleLike>, dx: number, dy: number): void {
  const x = source.x,
    y = source.y,
    width = source.width,
    height = source.height;
  out.x = x + dx;
  out.y = y + dy;
  out.width = width;
  out.height = height;
}

export function offsetRectangleByPoint(
  out: RectangleLike,
  source: Readonly<RectangleLike>,
  point: Readonly<Vector2Like>,
): void {
  const x = source.x,
    y = source.y,
    width = source.width,
    height = source.height;
  const pointX = point.x,
    pointY = point.y;
  out.x = x + pointX;
  out.y = y + pointY;
  out.width = width;
  out.height = height;
}

export function setEmptyRectangle(out: RectangleLike): void {
  out.x = out.y = out.width = out.height = 0;
}

export function setRectangle(out: RectangleLike, x: number, y: number, width: number, height: number): void {
  out.x = x;
  out.y = y;
  out.width = width;
  out.height = height;
}

export function setRectangleBottom(target: RectangleLike, value: number): void {
  const y = target.y;
  target.height = value - y;
}

export function setRectangleBottomRight(target: RectangleLike, point: Readonly<Vector2Like>): void {
  const x = target.x,
    y = target.y;
  const pointX = point.x,
    pointY = point.y;
  target.width = pointX - x;
  target.height = pointY - y;
}

export function setRectangleLeft(target: RectangleLike, value: number): void {
  const x = target.x,
    width = target.width;
  target.width = width - (value - x);
  target.x = value;
}

export function setRectangleRight(target: RectangleLike, value: number): void {
  const x = target.x;
  target.width = value - x;
}

export function setRectangleSize(out: RectangleLike, size: Readonly<Vector2Like>): void {
  const width = size.x,
    height = size.y;
  out.width = width;
  out.height = height;
}

export function setRectangleTop(target: RectangleLike, value: number): void {
  const y = target.y,
    height = target.height;
  target.height = height - (value - y);
  target.y = value;
}

export function setRectangleTopLeft(out: RectangleLike, point: Readonly<Vector2Like>): void {
  const x = point.x,
    y = point.y;
  out.x = x;
  out.y = y;
}
