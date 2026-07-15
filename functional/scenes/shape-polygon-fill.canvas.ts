// shape-polygon-fill — validates polygon fill rendering via appendShapePolygon.
//
// Draws a filled green pentagon (five vertices) centered at (200,150). The oracle verifies:
//   - the center of the pentagon is green (interior is correctly filled),
//   - a vertex-adjacent interior point is green,
//   - a point well outside the polygon is background black.
//
// Polygon rendering exercises the ear-clipping triangulation path used by the canvas shape
// renderer — a behavior jsdom cannot exercise.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapePolygon,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  invalidateNodeAppearance,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 400;
const HEIGHT = 300;
const CX = 200;
const CY = 150;
const RADIUS = 100;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [ShapeKind],
});

const points: number[] = [];
for (let i = 0; i < 5; i++) {
  const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
  points.push(CX + Math.cos(angle) * RADIUS);
  points.push(CY + Math.sin(angle) * RADIUS);
}

const root = createDisplayContainer();

const pentagon = createShape();
appendShapeBeginFill(pentagon, 0x00cc00, 1);
appendShapePolygon(pentagon, points);
appendShapeEndFill(pentagon);
invalidateNodeAppearance(pentagon);
addNodeChild(root, pentagon);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const center = at(CX, CY);
  if (!isGreen(center)) {
    throw new Error(`[shape-polygon-fill] center expected green, got #${hex(center)}`);
  }

  const nearVertex = at(CX, CY - RADIUS + 15);
  if (!isGreen(nearVertex)) {
    throw new Error(`[shape-polygon-fill] near top vertex expected green, got #${hex(nearVertex)}`);
  }

  const outside = at(20, 20);
  if (!isBlack(outside)) {
    throw new Error(`[shape-polygon-fill] outside expected black, got #${hex(outside)}`);
  }
}

function isGreen(rgb: number): boolean {
  return ((rgb >> 8) & 0xff) > 150 && ((rgb >> 16) & 0xff) < 90 && (rgb & 0xff) < 90;
}
function isBlack(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) < 30 && ((rgb >> 8) & 0xff) < 30 && (rgb & 0xff) < 30;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
