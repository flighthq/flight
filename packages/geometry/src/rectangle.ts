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

export function rectBottom(source: Readonly<RectangleLike>): number {
  return source.y + source.height;
}

/**
 * Sets a Vector2Like object with bottom-right coordinates
 */
export function rectBottomRight(out: Vector2Like, source: Readonly<RectangleLike>): void {
  out.x = source.x + source.width;
  out.y = source.y + source.height;
}

export function rectClone(source: Readonly<RectangleLike>): Rectangle {
  return createRectangle(source.x, source.y, source.width, source.height);
}

export function rectContains(source: Readonly<RectangleLike>, x: number, y: number): boolean {
  const x0 = Math.min(source.x, source.x + source.width);
  const x1 = Math.max(source.x, source.x + source.width);
  const y0 = Math.min(source.y, source.y + source.height);
  const y1 = Math.max(source.y, source.y + source.height);
  return x >= x0 && x < x1 && y >= y0 && y < y1;
}

export function rectContainsPoint(source: Readonly<RectangleLike>, vector: Readonly<Vector2Like>): boolean {
  return rectContains(source, vector.x, vector.y);
}

export function rectContainsRect(source: Readonly<RectangleLike>, other: Readonly<RectangleLike>): boolean {
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

export function rectCopy(out: RectangleLike, source: Readonly<RectangleLike>): void {
  if (out !== source) {
    out.x = source.x;
    out.y = source.y;
    out.width = source.width;
    out.height = source.height;
  }
}

export function rectEquals(
  a: Readonly<RectangleLike> | null | undefined,
  b: Readonly<RectangleLike> | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function rectInflate(out: RectangleLike, source: Readonly<RectangleLike>, dx: number, dy: number): void {
  out.x = source.x - dx;
  out.width = source.width + dx * 2;
  out.y = source.y - dy;
  out.height = source.height + dy * 2;
}

export function rectInflatePoint(
  out: RectangleLike,
  sourceRect: Readonly<RectangleLike>,
  sourceVec2: Readonly<Vector2Like>,
): void {
  rectInflate(out, sourceRect, sourceVec2.x, sourceVec2.y);
}

export function rectIntersection(out: RectangleLike, a: Readonly<RectangleLike>, b: Readonly<RectangleLike>): void {
  const x0 = Math.max(rectMinX(a), rectMinX(b));
  const x1 = Math.min(rectMaxX(a), rectMaxX(b));
  const y0 = Math.max(rectMinY(a), rectMinY(b));
  const y1 = Math.min(rectMaxY(a), rectMaxY(b));

  if (x1 <= x0 || y1 <= y0) {
    rectSetEmpty(out);
    return;
  }

  out.x = x0;
  out.y = y0;
  out.width = x1 - x0;
  out.height = y1 - y0;
}

export function rectIntersects(a: Readonly<RectangleLike>, b: Readonly<RectangleLike>): boolean {
  return !(
    rectMaxX(a) <= rectMinX(b) ||
    rectMinX(a) >= rectMaxX(b) ||
    rectMaxY(a) <= rectMinY(b) ||
    rectMinY(a) >= rectMaxY(b)
  );
}

/**
 * Returns true if width or height is 0
 *
 * Note: Negative width or height is considered valid
 */
export function rectIsEmpty(source: Readonly<RectangleLike>): boolean {
  return source.width === 0 || source.height === 0;
}

export function rectIsFlippedX(source: Readonly<RectangleLike>): boolean {
  return source.width < 0;
}

export function rectIsFlippedY(source: Readonly<RectangleLike>): boolean {
  return source.height < 0;
}

export function rectLeft(source: Readonly<RectangleLike>): number {
  return source.x;
}

export function rectMinX(source: Readonly<RectangleLike>): number {
  return Math.min(source.x, source.x + source.width);
}

export function rectMinY(source: Readonly<RectangleLike>): number {
  return Math.min(source.y, source.y + source.height);
}

export function rectMaxX(source: Readonly<RectangleLike>): number {
  return Math.max(source.x, source.x + source.width);
}

export function rectMaxY(source: Readonly<RectangleLike>): number {
  return Math.max(source.y, source.y + source.height);
}

export function rectNormalize(out: RectangleLike, source: Readonly<RectangleLike>): void {
  const _minX = rectMinX(source);
  const _minY = rectMinY(source);
  out.x = _minX;
  out.y = _minY;
  out.width = rectMaxX(source) - _minX;
  out.height = rectMaxY(source) - _minY;
}

export function rectNormalizedBottomRight(out: Vector2Like, source: Readonly<RectangleLike>): void {
  out.x = rectMaxX(source);
  out.y = rectMaxY(source);
}

export function rectNormalizedTopLeft(out: Vector2Like, source: Readonly<RectangleLike>): void {
  out.x = rectMinX(source);
  out.y = rectMinY(source);
}

export function rectOffset(out: RectangleLike, source: Readonly<RectangleLike>, dx: number, dy: number): void {
  out.x = source.x + dx;
  out.y = source.y + dy;
  out.width = source.width;
  out.height = source.height;
}

export function rectOffsetPoint(
  out: RectangleLike,
  source: Readonly<RectangleLike>,
  point: Readonly<Vector2Like>,
): void {
  out.x = source.x + point.x;
  out.y = source.y + point.y;
  out.width = source.width;
  out.height = source.height;
}

export function rectRight(source: Readonly<RectangleLike>): number {
  return source.x + source.width;
}

export function rectSetBottom(target: RectangleLike, value: number): void {
  target.height = value - target.y;
}

export function rectSetBottomRight(target: RectangleLike, point: Readonly<Vector2Like>): void {
  target.width = point.x - target.x;
  target.height = point.y - target.y;
}

export function rectSetEmpty(out: RectangleLike): void {
  out.x = out.y = out.width = out.height = 0;
}

export function rectSetLeft(target: RectangleLike, value: number): void {
  target.width -= value - target.x;
  target.x = value;
}

export function rectSetRight(target: RectangleLike, value: number): void {
  target.width = value - target.x;
}

export function rectSetSize(out: RectangleLike, size: Readonly<Vector2Like>): void {
  out.width = size.x;
  out.height = size.y;
}

export function rectSetTo(out: RectangleLike, x: number, y: number, width: number, height: number): void {
  out.x = x;
  out.y = y;
  out.width = width;
  out.height = height;
}

export function rectSetTop(target: RectangleLike, value: number): void {
  target.height -= value - target.y;
  target.y = value;
}

export function rectSetTopLeft(out: RectangleLike, point: Readonly<Vector2Like>): void {
  out.x = point.x;
  out.y = point.y;
}

/**
 * Sets a Vector2Like object to width and height
 */
export function rectSize(out: Vector2Like, source: Readonly<RectangleLike>): void {
  out.x = source.width;
  out.y = source.height;
}

export function rectTop(source: Readonly<RectangleLike>): number {
  return source.y;
}

/**
 * Sets a Vector2Like object with top-left coordinates
 */
export function rectTopLeft(out: Vector2Like, source: Readonly<RectangleLike>): void {
  out.x = source.x;
  out.y = source.y;
}

// Aliases for pool compatibility
export { createRectangle as create };

export function rectUnion(out: RectangleLike, source: Readonly<RectangleLike>, other: Readonly<RectangleLike>): void {
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
