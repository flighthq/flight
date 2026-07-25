import { intersectsRectangle } from '@flighthq/geometry';
import { getNodeRuntime, getNodeWorldBoundsRectangle } from '@flighthq/node';
import type { Node2D, Rectangle } from '@flighthq/types';

export function hitTestAreaQuery(root: Node2D, rect: Readonly<Rectangle>, out: Node2D[] = []): Node2D[] {
  if (!root.enabled) return out;

  const worldBounds = getNodeWorldBoundsRectangle(root);
  if (intersectsRectangle(worldBounds, rect)) {
    out.push(root);
  }

  const children = getNodeRuntime(root).children;
  if (children !== null) {
    for (const child of children) {
      hitTestAreaQuery(child as Node2D, rect, out);
    }
  }

  return out;
}

export function hitTestAreaQueryCircle(
  root: Node2D,
  cx: number,
  cy: number,
  radius: number,
  out: Node2D[] = [],
): Node2D[] {
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
      hitTestAreaQueryCircle(child as Node2D, cx, cy, radius, out);
    }
  }

  return out;
}
