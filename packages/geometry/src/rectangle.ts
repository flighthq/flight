import { createEntity } from '@flighthq/entity';
import type { Rectangle, RectangleLike, Vector2Like } from '@flighthq/types';

export function createRectangle(x?: number, y?: number, width?: number, height?: number): Rectangle {
  return createEntity({
    x: x ?? 0,
    y: y ?? 0,
    width: width ?? 0,
    height: height ?? 0,
  });
}

export function getRectangleBottom(source: Readonly<RectangleLike>): number {
  return source.y + source.height;
}

/**
 * Sets a Vector2Like object with bottom-right coordinates
 */
export function getRectangleBottomRight(out: Vector2Like, source: Readonly<RectangleLike>): void {
  out.x = source.x + source.width;
  out.y = source.y + source.height;
}

export function cloneRectangle(source: Readonly<RectangleLike>): Rectangle {
  return createRectangle(source.x, source.y, source.width, source.height);
}

export function rectangleContains(source: Readonly<RectangleLike>, x: number, y: number): boolean {
  const x0 = Math.min(source.x, source.x + source.width);
  const x1 = Math.max(source.x, source.x + source.width);
  const y0 = Math.min(source.y, source.y + source.height);
  const y1 = Math.max(source.y, source.y + source.height);
  return x >= x0 && x < x1 && y >= y0 && y < y1;
}

export function rectangleContainsPoint(source: Readonly<RectangleLike>, vector: Readonly<Vector2Like>): boolean {
  return rectangleContains(source, vector.x, vector.y);
}

export function rectangleEncloses(source: Readonly<RectangleLike>, other: Readonly<RectangleLike>): boolean {
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

export function copyRectangle(out: RectangleLike, source: Readonly<RectangleLike>): void {
  if (out !== source) {
    out.x = source.x;
    out.y = source.y;
    out.width = source.width;
    out.height = source.height;
  }
}

export function rectangleEquals(
  a: Readonly<RectangleLike> | null | undefined,
  b: Readonly<RectangleLike> | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function inflateRectangle(out: RectangleLike, source: Readonly<RectangleLike>, dx: number, dy: number): void {
  out.x = source.x - dx;
  out.width = source.width + dx * 2;
  out.y = source.y - dy;
  out.height = source.height + dy * 2;
}

export function expandRectangleToPoint(
  out: RectangleLike,
  sourceRect: Readonly<RectangleLike>,
  sourceVec2: Readonly<Vector2Like>,
): void {
  inflateRectangle(out, sourceRect, sourceVec2.x, sourceVec2.y);
}

export function intersectionRectangle(
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

export function rectangleIntersects(a: Readonly<RectangleLike>, b: Readonly<RectangleLike>): boolean {
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

export function getRectangleLeft(source: Readonly<RectangleLike>): number {
  return source.x;
}

export function getRectangleMinX(source: Readonly<RectangleLike>): number {
  return Math.min(source.x, source.x + source.width);
}

export function getRectangleMinY(source: Readonly<RectangleLike>): number {
  return Math.min(source.y, source.y + source.height);
}

export function getRectangleMaxX(source: Readonly<RectangleLike>): number {
  return Math.max(source.x, source.x + source.width);
}

export function getRectangleMaxY(source: Readonly<RectangleLike>): number {
  return Math.max(source.y, source.y + source.height);
}

export function normalizeRectangle(out: RectangleLike, source: Readonly<RectangleLike>): void {
  const _minX = getRectangleMinX(source);
  const _minY = getRectangleMinY(source);
  out.x = _minX;
  out.y = _minY;
  out.width = getRectangleMaxX(source) - _minX;
  out.height = getRectangleMaxY(source) - _minY;
}

export function getRectangleNormalizedBottomRight(out: Vector2Like, source: Readonly<RectangleLike>): void {
  out.x = getRectangleMaxX(source);
  out.y = getRectangleMaxY(source);
}

export function getRectangleNormalizedTopLeft(out: Vector2Like, source: Readonly<RectangleLike>): void {
  out.x = getRectangleMinX(source);
  out.y = getRectangleMinY(source);
}

export function offsetRectangle(out: RectangleLike, source: Readonly<RectangleLike>, dx: number, dy: number): void {
  out.x = source.x + dx;
  out.y = source.y + dy;
  out.width = source.width;
  out.height = source.height;
}

export function offsetRectangleByPoint(
  out: RectangleLike,
  source: Readonly<RectangleLike>,
  point: Readonly<Vector2Like>,
): void {
  out.x = source.x + point.x;
  out.y = source.y + point.y;
  out.width = source.width;
  out.height = source.height;
}

export function getRectangleRight(source: Readonly<RectangleLike>): number {
  return source.x + source.width;
}

export function setRectangleBottom(target: RectangleLike, value: number): void {
  target.height = value - target.y;
}

export function setRectangleBottomRight(target: RectangleLike, point: Readonly<Vector2Like>): void {
  target.width = point.x - target.x;
  target.height = point.y - target.y;
}

export function setEmptyRectangle(out: RectangleLike): void {
  out.x = out.y = out.width = out.height = 0;
}

export function setRectangleLeft(target: RectangleLike, value: number): void {
  target.width -= value - target.x;
  target.x = value;
}

export function setRectangleRight(target: RectangleLike, value: number): void {
  target.width = value - target.x;
}

export function setRectangleSize(out: RectangleLike, size: Readonly<Vector2Like>): void {
  out.width = size.x;
  out.height = size.y;
}

export function setRectangle(out: RectangleLike, x: number, y: number, width: number, height: number): void {
  out.x = x;
  out.y = y;
  out.width = width;
  out.height = height;
}

export function setRectangleTop(target: RectangleLike, value: number): void {
  target.height -= value - target.y;
  target.y = value;
}

export function setRectangleTopLeft(out: RectangleLike, point: Readonly<Vector2Like>): void {
  out.x = point.x;
  out.y = point.y;
}

/**
 * Sets a Vector2Like object to width and height
 */
export function getRectangleSize(out: Vector2Like, source: Readonly<RectangleLike>): void {
  out.x = source.width;
  out.y = source.height;
}

export function getRectangleTop(source: Readonly<RectangleLike>): number {
  return source.y;
}

/**
 * Sets a Vector2Like object with top-left coordinates
 */
export function getRectangleTopLeft(out: Vector2Like, source: Readonly<RectangleLike>): void {
  out.x = source.x;
  out.y = source.y;
}

export function unionRectangle(
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

    let x0 = Math.min(sourceLeft, otherLeft);
    const x1 = Math.max(sourceRight, otherRight);
    const y0 = Math.min(sourceTop, otherTop);
    const y1 = Math.max(sourceBottom, otherBottom);

    out.x = x0;
    out.y = y0;
    out.width = x1 - x0;
    out.height = y1 - y0;
  }
}
