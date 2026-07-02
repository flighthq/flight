import { intersectsRectangle } from '@flighthq/geometry';
import { getNodeRuntime, getNodeWorldBoundsRectangle } from '@flighthq/node';
import type { DisplayObject, Rectangle } from '@flighthq/types';

export function hitTestAreaQuery(
  root: DisplayObject,
  rect: Readonly<Rectangle>,
  out: DisplayObject[] = [],
): DisplayObject[] {
  if (!root.enabled) return out;

  const worldBounds = getNodeWorldBoundsRectangle(root);
  if (intersectsRectangle(worldBounds, rect)) {
    out.push(root);
  }

  const children = getNodeRuntime(root).children;
  if (children !== null) {
    for (const child of children) {
      hitTestAreaQuery(child as DisplayObject, rect, out);
    }
  }

  return out;
}

export function hitTestAreaQueryCircle(
  root: DisplayObject,
  cx: number,
  cy: number,
  radius: number,
  out: DisplayObject[] = [],
): DisplayObject[] {
  if (!root.enabled) return out;

  const b = getNodeWorldBoundsRectangle(root);
  const nearX = Math.max(b.x, Math.min(cx, b.x + b.width));
  const nearY = Math.max(b.y, Math.min(cy, b.y + b.height));
  const dx = cx - nearX;
  const dy = cy - nearY;
  if (dx * dx + dy * dy <= radius * radius) {
    out.push(root);
  }

  const children = getNodeRuntime(root).children;
  if (children !== null) {
    for (const child of children) {
      hitTestAreaQueryCircle(child as DisplayObject, cx, cy, radius, out);
    }
  }

  return out;
}
