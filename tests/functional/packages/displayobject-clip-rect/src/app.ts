// displayobject-clip-rect — validates rectangular clipping: a large filled shape is clipped to a SMALLER axis-aligned
// rectangle via setDisplayObjectClip(node, createClipRegionFromRectangle(...)). The clip window keeps only
// the pixels inside it; everything outside the window is removed even though the shape covers it.
//
// Clipping is a core compositional primitive (the substrate of scroll rects and viewports) and is the kind
// of thing only a pixel render can prove: jsdom cannot show that geometry outside the clip window is gone.
// The scene draws one 400x400 orange rectangle and clips it to a 160x160 window inset from the shape's
// top-left. The oracle proves (1) a point inside both the shape and the clip window is the shape color;
// (2) a point inside the SHAPE but OUTSIDE the clip window is background — i.e. clipped away, not painted;
// (3) a point outside both is background.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createClipRegionFromRectangle,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  setDisplayObjectClip,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// A large orange square, drawn in the shape's local space at (SHAPE_X, SHAPE_Y).
const SHAPE_X = 200;
const SHAPE_Y = 120;
const SHAPE_SIZE = 400;
const SHAPE_COLOR = 0xff8800; // 24-bit RGB

// The clip window is in the shape node's LOCAL space. It keeps a 160x160 patch anchored at the shape's
// top-left corner, so the rest of the orange square is clipped away.
const CLIP_X = SHAPE_X;
const CLIP_Y = SHAPE_Y;
const CLIP_SIZE = 160;

const { render, width } = await createFunctionalTarget({
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
setDisplayObjectClip(
  shape,
  createClipRegionFromRectangle({ x: CLIP_X, y: CLIP_Y, width: CLIP_SIZE, height: CLIP_SIZE }),
);
addNodeChild(root, shape);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // 1) Inside the clip window AND inside the shape: shape color survives.
  const inside = at(CLIP_X + CLIP_SIZE / 2, CLIP_Y + CLIP_SIZE / 2);
  if (!isShapeColor(inside)) {
    throw new Error(`[displayobject-clip-rect] inside clip window not orange — got #${hex(inside)}`);
  }

  // 2) Inside the SHAPE but well OUTSIDE the clip window: clipped away → background.
  const clippedX = SHAPE_X + SHAPE_SIZE - 40; // far right, inside the orange square
  const clippedY = SHAPE_Y + SHAPE_SIZE - 40; // far bottom, inside the orange square
  const clipped = at(clippedX, clippedY);
  if (!isBackground(clipped)) {
    throw new Error(
      `[displayobject-clip-rect] shape pixel outside clip window not clipped to background — got #${hex(clipped)}`,
    );
  }

  // 3) Outside both shape and clip window: background.
  const outside = at(40, 40);
  if (!isBackground(outside)) {
    throw new Error(`[displayobject-clip-rect] point outside everything not background — got #${hex(outside)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isShapeColor(rgb: number): boolean {
  // orange ~ (255, 136, 0): strong red, mid green, low blue
  return channel(rgb, 16) > 180 && channel(rgb, 8) > 70 && channel(rgb, 8) < 200 && channel(rgb, 0) < 90;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
