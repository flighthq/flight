// camera2d-viewport — validates that a Camera2D view transform, when applied through the display
// object transform system, produces correct world→screen mapping.
//
// Camera centered at world (200, 200) with 2× zoom on an 800×600 viewport. Three circles at known
// world positions:
//   red   at world (200, 200) → screen (400, 300) — viewport center
//   blue  at world (100, 100) → screen (200, 100)
//   green at world (300, 300) → screen (600, 500)
//
// The view matrix is: translate(400,300) · scale(2) · translate(-200,-200). The oracle verifies
// each circle lands at the expected screen position — a pure math unit test checks the matrix
// values, but only a real render proves the camera→container→renderer chain maps pixels correctly.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEndFill,
  createCamera2D,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;
const RADIUS = 30;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [ShapeKind],
});

const camera = createCamera2D(WIDTH, HEIGHT);
camera.x = 200;
camera.y = 200;
camera.zoom = 2;

const cameraRoot = createDisplayContainer();
cameraRoot.pivotX = camera.x;
cameraRoot.pivotY = camera.y;
cameraRoot.x = WIDTH / 2;
cameraRoot.y = HEIGHT / 2;
cameraRoot.scaleX = camera.zoom;
cameraRoot.scaleY = camera.zoom;
invalidateNodeLocalTransform(cameraRoot);

const root = createDisplayContainer();
addNodeChild(root, cameraRoot);

const redCircle = createShape();
appendShapeBeginFill(redCircle, 0xff0000, 1);
appendShapeCircle(redCircle, 200, 200, RADIUS);
appendShapeEndFill(redCircle);
addNodeChild(cameraRoot, redCircle);

const blueCircle = createShape();
appendShapeBeginFill(blueCircle, 0x0000ff, 1);
appendShapeCircle(blueCircle, 100, 100, RADIUS);
appendShapeEndFill(blueCircle);
addNodeChild(cameraRoot, blueCircle);

const greenCircle = createShape();
appendShapeBeginFill(greenCircle, 0x00ff00, 1);
appendShapeCircle(greenCircle, 300, 300, RADIUS);
appendShapeEndFill(greenCircle);
addNodeChild(cameraRoot, greenCircle);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  if (!isRed(at(400, 300))) {
    throw new Error(`[camera2d-viewport] red circle should be at screen center (400,300) — got #${hex(at(400, 300))}`);
  }

  if (!isBlue(at(200, 100))) {
    throw new Error(`[camera2d-viewport] blue circle should be at screen (200,100) — got #${hex(at(200, 100))}`);
  }

  if (!isGreen(at(600, 500))) {
    throw new Error(`[camera2d-viewport] green circle should be at screen (600,500) — got #${hex(at(600, 500))}`);
  }

  if (!isBackground(at(0, 0))) {
    throw new Error(`[camera2d-viewport] corner (0,0) should be background — got #${hex(at(0, 0))}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function isBlue(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) > 180;
}
function isGreen(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) > 180 && channel(rgb, 0) < 60;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 30 && channel(rgb, 8) < 30 && channel(rgb, 0) < 30;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
