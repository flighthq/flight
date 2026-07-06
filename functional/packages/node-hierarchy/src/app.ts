// node-hierarchy — validates that nested container transforms COMPOUND and that container alpha is
// INHERITED by descendants. An outer container is translated, an inner container (child of the outer)
// is translated again in the outer's local space, and a filled shape sits at the inner's local origin.
//
// This needs a real render because both behaviours are emergent from the scene-graph walk: the shape has
// no transform of its own, yet must land at outer+inner+local, and it is fully opaque yet must render at
// half strength because the OUTER container's alpha (0.5) propagates down. The oracle samples the
// compounded location (a green blended ~50% over black) and a far point (background), so it fails unless
// both the transform composition and the alpha inheritance reached the drawn pixels.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const FILL = 0x33cc66; // green: R=0x33, G=0xcc, B=0x66
const SHAPE_SIZE = 120;

const OUTER_X = 200;
const OUTER_Y = 150;
const INNER_DX = 120;
const INNER_DY = 90;

// Compounded world origin of the shape: outer + inner + local(0,0).
const COMPOUND_X = OUTER_X + INNER_DX;
const COMPOUND_Y = OUTER_Y + INNER_DY;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

const outer = createDisplayContainer();
outer.x = OUTER_X;
outer.y = OUTER_Y;
outer.alpha = 0.5; // inherited by every descendant
invalidateNodeLocalTransform(outer);
invalidateNodeAppearance(outer);
addNodeChild(root, outer);

const inner = createDisplayContainer();
inner.x = INNER_DX;
inner.y = INNER_DY;
invalidateNodeLocalTransform(inner);
addNodeChild(outer, inner);

const shape = createShape();
appendShapeBeginFill(shape, FILL, 1);
appendShapeRectangle(shape, 0, 0, SHAPE_SIZE, SHAPE_SIZE);
appendShapeEndFill(shape);
addNodeChild(inner, shape);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // 1) Well inside the compounded footprint: green blended ~50% over black. Full green channel is 0xcc
  //    (204); at half alpha over black it lands ~80–130. Red/blue stay low, so this also proves the
  //    correct color reached the correct compounded location.
  const inShape = at(COMPOUND_X + SHAPE_SIZE / 2, COMPOUND_Y + SHAPE_SIZE / 2);
  const g = channel(inShape, 8);
  if (g < 70 || g > 140) {
    throw new Error(`[node-hierarchy] green channel ${g} not in half-alpha range (70..140) — got #${hex(inShape)}`);
  }
  if (channel(inShape, 16) > 70 || channel(inShape, 0) > 90) {
    throw new Error(`[node-hierarchy] red/blue channels too high for green-over-black — got #${hex(inShape)}`);
  }

  // 2) Far from the compounded footprint: background. Proves the shape did not render at the inner or
  //    outer origin alone (those would put it elsewhere) and that nothing leaked.
  const far = at(700, 520);
  if (!isBackground(far)) {
    throw new Error(`[node-hierarchy] far point not background — got #${hex(far)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
