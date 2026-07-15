import {
  createCollisionManifold,
  testAabbAabbCollision,
  testAabbPolygonCollision,
  testCircleAabbCollision,
  testCircleCircleCollision,
  testCirclePolygonCollision,
  testPolygonPolygonCollision,
} from '@flighthq/collision';
import type { CollisionAabb, CollisionCircle, CollisionManifold, CollisionPolygon, Shape } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeRectangle,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  clearShapeCommands,
  createDisplayObject,
  createShape,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';

import { canvas, render, scale } from './render';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

const COLOR_IDLE = 0x4488cc;
const COLOR_COLLIDING = 0xcc4444;
const COLOR_MTV = 0x44cc44;

const main = createDisplayObject();
main.scaleX = scale;
main.scaleY = scale;

// Collider definitions: plain data that the collision package operates on, plus the position offset
// needed to draw the corresponding shape centered on the collider.

interface CircleCollider {
  kind: 'circle';
  collider: CollisionCircle;
  shape: Shape;
}

interface AabbCollider {
  kind: 'aabb';
  collider: CollisionAabb;
  shape: Shape;
}

interface PolygonCollider {
  kind: 'polygon';
  collider: CollisionPolygon;
  centerX: number;
  centerY: number;
  shape: Shape;
}

type Collider = CircleCollider | AabbCollider | PolygonCollider;

function createCircleCollider(x: number, y: number, radius: number): CircleCollider {
  const shape = createShape();
  addNodeChild(main, shape);
  return { kind: 'circle', collider: { x, y, radius }, shape };
}

function createAabbCollider(centerX: number, centerY: number, halfW: number, halfH: number): AabbCollider {
  const shape = createShape();
  addNodeChild(main, shape);
  return {
    kind: 'aabb',
    collider: { minX: centerX - halfW, minY: centerY - halfH, maxX: centerX + halfW, maxY: centerY + halfH },
    shape,
  };
}

function createPolygonCollider(centerX: number, centerY: number, points: number[]): PolygonCollider {
  const shape = createShape();
  addNodeChild(main, shape);
  return { kind: 'polygon', collider: { points }, centerX, centerY, shape };
}

function makeRegularPolygonPoints(cx: number, cy: number, radius: number, sides: number): number[] {
  const points: number[] = [];
  const angleStep = (Math.PI * 2) / sides;
  const startAngle = -Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + angleStep * i;
    points.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  return points;
}

// Scene: two circles, one AABB, one convex polygon (pentagon).
const colliders: Collider[] = [
  createCircleCollider(200, 200, 50),
  createCircleCollider(400, 300, 40),
  createAabbCollider(550, 200, 60, 45),
  createPolygonCollider(300, 450, makeRegularPolygonPoints(300, 450, 55, 5)),
];

// MTV visualization overlay — a single shape redrawn each frame with all active MTV arrows.
const mtvOverlay = createShape();
addNodeChild(main, mtvOverlay);

// Returns the center of a collider in world space, used for drag offset and MTV line origin.
function getColliderCenter(c: Collider): { x: number; y: number } {
  switch (c.kind) {
    case 'circle':
      return { x: c.collider.x, y: c.collider.y };
    case 'aabb':
      return { x: (c.collider.minX + c.collider.maxX) * 0.5, y: (c.collider.minY + c.collider.maxY) * 0.5 };
    case 'polygon':
      return { x: c.centerX, y: c.centerY };
  }
}

function moveCollider(c: Collider, dx: number, dy: number): void {
  switch (c.kind) {
    case 'circle':
      c.collider.x += dx;
      c.collider.y += dy;
      break;
    case 'aabb':
      c.collider.minX += dx;
      c.collider.minY += dy;
      c.collider.maxX += dx;
      c.collider.maxY += dy;
      break;
    case 'polygon': {
      c.centerX += dx;
      c.centerY += dy;
      const pts = c.collider.points as number[];
      for (let i = 0; i < pts.length; i += 2) {
        pts[i] += dx;
        pts[i + 1] += dy;
      }
      break;
    }
  }
}

function isPointInsideCollider(c: Collider, px: number, py: number): boolean {
  switch (c.kind) {
    case 'circle': {
      const dx = px - c.collider.x;
      const dy = py - c.collider.y;
      return dx * dx + dy * dy <= c.collider.radius * c.collider.radius;
    }
    case 'aabb':
      return px >= c.collider.minX && px <= c.collider.maxX && py >= c.collider.minY && py <= c.collider.maxY;
    case 'polygon': {
      // Winding-number point-in-polygon for convex shapes.
      const pts = c.collider.points;
      const n = pts.length >> 1;
      let inside = true;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ex = pts[j * 2] - pts[i * 2];
        const ey = pts[j * 2 + 1] - pts[i * 2 + 1];
        const tx = px - pts[i * 2];
        const ty = py - pts[i * 2 + 1];
        if (ex * ty - ey * tx < 0) {
          inside = false;
          break;
        }
      }
      return inside;
    }
  }
}

// Test one pair for collision, dispatching on the two kinds.
function testPairCollision(a: Collider, b: Collider, out: CollisionManifold): boolean {
  if (a.kind === 'circle' && b.kind === 'circle') {
    return testCircleCircleCollision(a.collider, b.collider, out);
  }
  if (a.kind === 'circle' && b.kind === 'aabb') {
    return testCircleAabbCollision(a.collider, b.collider, out);
  }
  if (a.kind === 'aabb' && b.kind === 'circle') {
    const result = testCircleAabbCollision(b.collider, a.collider, out);
    if (result) {
      out.normalX = -out.normalX;
      out.normalY = -out.normalY;
    }
    return result;
  }
  if (a.kind === 'aabb' && b.kind === 'aabb') {
    return testAabbAabbCollision(a.collider, b.collider, out);
  }
  if (a.kind === 'circle' && b.kind === 'polygon') {
    return testCirclePolygonCollision(a.collider, b.collider, out);
  }
  if (a.kind === 'polygon' && b.kind === 'circle') {
    const result = testCirclePolygonCollision(b.collider, a.collider, out);
    if (result) {
      out.normalX = -out.normalX;
      out.normalY = -out.normalY;
    }
    return result;
  }
  if (a.kind === 'polygon' && b.kind === 'polygon') {
    return testPolygonPolygonCollision(a.collider, b.collider, out);
  }
  if (a.kind === 'aabb' && b.kind === 'polygon') {
    return testAabbPolygonCollision(a.collider, b.collider, out);
  }
  if (a.kind === 'polygon' && b.kind === 'aabb') {
    const result = testAabbPolygonCollision(b.collider, a.collider, out);
    if (result) {
      out.normalX = -out.normalX;
      out.normalY = -out.normalY;
    }
    return result;
  }
  return false;
}

// Redraw one collider's shape with the given fill color.
function redrawCollider(c: Collider, color: number): void {
  clearShapeCommands(c.shape);
  appendShapeBeginFill(c.shape, color, 0.6);
  appendShapeLineStyle(c.shape, 2, color);

  switch (c.kind) {
    case 'circle':
      appendShapeCircle(c.shape, c.collider.x, c.collider.y, c.collider.radius);
      break;
    case 'aabb':
      appendShapeRectangle(
        c.shape,
        c.collider.minX,
        c.collider.minY,
        c.collider.maxX - c.collider.minX,
        c.collider.maxY - c.collider.minY,
      );
      break;
    case 'polygon': {
      const pts = c.collider.points;
      appendShapeMoveTo(c.shape, pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) {
        appendShapeLineTo(c.shape, pts[i], pts[i + 1]);
      }
      appendShapeLineTo(c.shape, pts[0], pts[1]);
      break;
    }
  }
  appendShapeEndFill(c.shape);
  invalidateNodeLocalTransform(c.shape);
}

// Draw an MTV arrow from a point along the normal with the given depth.
function drawMtvArrow(
  shape: Shape,
  originX: number,
  originY: number,
  normalX: number,
  normalY: number,
  depth: number,
): void {
  const endX = originX + normalX * depth;
  const endY = originY + normalY * depth;

  appendShapeLineStyle(shape, 3, COLOR_MTV);
  appendShapeMoveTo(shape, originX, originY);
  appendShapeLineTo(shape, endX, endY);

  // Arrowhead.
  const arrowSize = 8;
  const perpX = -normalY;
  const perpY = normalX;
  appendShapeMoveTo(
    shape,
    endX - normalX * arrowSize + perpX * arrowSize * 0.5,
    endY - normalY * arrowSize + perpY * arrowSize * 0.5,
  );
  appendShapeLineTo(shape, endX, endY);
  appendShapeLineTo(
    shape,
    endX - normalX * arrowSize - perpX * arrowSize * 0.5,
    endY - normalY * arrowSize - perpY * arrowSize * 0.5,
  );
}

// Pointer drag state.
let dragTarget: Collider | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

const canvasElement = canvas;

canvasElement.addEventListener('pointerdown', (e: PointerEvent) => {
  const rect = canvasElement.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
  const py = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

  // Pick the topmost collider under the pointer (iterate in reverse for z-order).
  for (let i = colliders.length - 1; i >= 0; i--) {
    if (isPointInsideCollider(colliders[i], px, py)) {
      dragTarget = colliders[i];
      const center = getColliderCenter(dragTarget);
      dragOffsetX = px - center.x;
      dragOffsetY = py - center.y;
      canvasElement.setPointerCapture(e.pointerId);
      break;
    }
  }
});

canvasElement.addEventListener('pointermove', (e: PointerEvent) => {
  if (!dragTarget) return;
  const rect = canvasElement.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
  const py = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

  const center = getColliderCenter(dragTarget);
  const dx = px - dragOffsetX - center.x;
  const dy = py - dragOffsetY - center.y;
  moveCollider(dragTarget, dx, dy);
});

canvasElement.addEventListener('pointerup', () => {
  dragTarget = null;
});

const manifold = createCollisionManifold();

function enterFrame(): void {
  // Determine which colliders are involved in at least one overlap.
  const collidingSet = new Set<Collider>();

  interface ManifoldRecord {
    originX: number;
    originY: number;
    normalX: number;
    normalY: number;
    depth: number;
  }
  const manifolds: ManifoldRecord[] = [];

  for (let i = 0; i < colliders.length; i++) {
    for (let j = i + 1; j < colliders.length; j++) {
      const a = colliders[i];
      const b = colliders[j];
      if (testPairCollision(a, b, manifold)) {
        collidingSet.add(a);
        collidingSet.add(b);
        const centerA = getColliderCenter(a);
        manifolds.push({
          originX: centerA.x,
          originY: centerA.y,
          normalX: manifold.normalX,
          normalY: manifold.normalY,
          depth: manifold.depth,
        });
      }
    }
  }

  // Redraw each collider with the appropriate color.
  for (const c of colliders) {
    redrawCollider(c, collidingSet.has(c) ? COLOR_COLLIDING : COLOR_IDLE);
  }

  // Redraw the MTV overlay.
  clearShapeCommands(mtvOverlay);
  for (const m of manifolds) {
    drawMtvArrow(mtvOverlay, m.originX, m.originY, m.normalX, m.normalY, m.depth * 2);
  }
  invalidateNodeLocalTransform(mtvOverlay);

  render(main);
  requestAnimationFrame(enterFrame);
}

enterFrame();
