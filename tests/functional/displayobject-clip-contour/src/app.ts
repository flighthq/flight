// displayobject-clip-contour — validates polygon (contour) clipping: a large filled shape is clipped to a TRIANGULAR
// contour via createClipRegionFromPath(path). Unlike a rectangle clip, this exercises the path → flattened
// contour → stencil-then-cover clip path (native ctx.clip on canvas), the same machinery that replaced the
// per-kind mask renderers.
//
// Contour clipping is purely visual: only a real render can prove a pixel inside the shape's bounding box
// but OUTSIDE the polygon is removed, while a pixel inside the polygon survives. The scene draws one large
// cyan rectangle and clips it to a triangle (apex top-center, base along the bottom). The oracle proves
// (1) a point near the triangle's centroid (well inside the polygon AND the shape) is the shape color; and
// (2) a corner of the triangle's bounding box that the triangle does not cover — but which IS inside the
// rectangle — is clipped to background.
import type { Path, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendPathLineTo,
  appendPathMoveTo,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createClipRegionFromPath,
  createDisplayContainer,
  createPath,
  createShape,
  getSurfacePixelRgb,
  setDisplayObjectClip,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// A large cyan square covering the triangle's bounding box and then some, in the shape's local space.
const SHAPE_X = 150;
const SHAPE_Y = 100;
const SHAPE_SIZE = 460;
const SHAPE_COLOR = 0x00ccdd; // 24-bit RGB (cyan)

// Triangle clip in the shape node's LOCAL space: apex top-center, base along the bottom.
const APEX_X = 400;
const APEX_Y = 150;
const BASE_LEFT_X = 250;
const BASE_RIGHT_X = 550;
const BASE_Y = 450;

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [ShapeKind],
  clip: true,
});

const root = createDisplayContainer();

const shape = createShape();
appendShapeBeginFill(shape, SHAPE_COLOR, 1);
appendShapeRectangle(shape, SHAPE_X, SHAPE_Y, SHAPE_SIZE, SHAPE_SIZE);
appendShapeEndFill(shape);

const triangle = createTrianglePath();
setDisplayObjectClip(shape, createClipRegionFromPath(triangle));
addNodeChild(root, shape);

render(root);

// Closed triangle contour: move to the apex, line through both base vertices, then back to the apex so the
// flattened contour is closed (the clip fills the enclosed region).
function createTrianglePath(): Path {
  const path = createPath();
  appendPathMoveTo(path, APEX_X, APEX_Y);
  appendPathLineTo(path, BASE_RIGHT_X, BASE_Y);
  appendPathLineTo(path, BASE_LEFT_X, BASE_Y);
  appendPathLineTo(path, APEX_X, APEX_Y);
  return path;
}

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // 1) Near the triangle's centroid — deep inside the polygon and the shape: shape color survives.
  const centroidX = (APEX_X + BASE_LEFT_X + BASE_RIGHT_X) / 3; // 400
  const centroidY = (APEX_Y + BASE_Y + BASE_Y) / 3; // 350
  const inside = at(centroidX, centroidY);
  if (!isShapeColor(inside)) {
    throw new Error(`[displayobject-clip-contour] triangle interior not cyan — got #${hex(inside)}`);
  }

  // 2) Top-left corner of the triangle's bounding box: inside the cyan rectangle, but OUTSIDE the triangle
  // (the left edge runs from the apex down to the bottom-left, far to the right of this point at this y).
  const corner = at(BASE_LEFT_X + 20, APEX_Y + 20); // (270, 170)
  if (!isBackground(corner)) {
    throw new Error(
      `[displayobject-clip-contour] bbox corner outside polygon not clipped to background — got #${hex(corner)}`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isShapeColor(rgb: number): boolean {
  // cyan ~ (0, 204, 221): low red, strong green and blue
  return channel(rgb, 16) < 90 && channel(rgb, 8) > 150 && channel(rgb, 0) > 150;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
