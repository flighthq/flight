// scale9-stretch — validates nine-slice (scale9Grid) rendering of a Scale9Shape: the center stretches while the
// border slices keep their thickness when the shape is scaled up large.
//
// A Scale9Shape carries a scale9Grid rect marking the non-stretching center. When the node is scaled, the
// renderer remaps each shape command's coordinates so the four corner slices stay fixed-size, the four
// edge slices stretch along one axis, and only the center stretches in both — the classic UI-panel "frame
// that doesn't distort its border" behavior. (DOM intentionally does not register Scale9, so this runs on
// canvas/webgl/webgpu only — that omission is expected.)
//
// The scene authors a bordered panel: an outer filled rect in the border color (blue) and an inner filled
// rect in the fill color (yellow), inset by BORDER. Natural size is NATURAL×NATURAL with the grid inset
// BORDER on every side, then the node is scaled up large. The oracle proves the nine-slice rendered and
// stretched: a wide band of interior sample points are all the fill color (the center grew), and the
// border color is present just inside each of the four edges (the frame survived the stretch). This is
// inherently visual — coordinate remapping per slice cannot be confirmed in jsdom.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createDisplayContainer,
  createScale9Shape,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
  Scale9ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// Natural (unscaled) shape: a NATURAL×NATURAL panel with a BORDER-thick frame.
const NATURAL = 60;
const BORDER = 12;
const FILL_COLOR = 0xffff00; // yellow center
const BORDER_COLOR = 0x0000ff; // blue frame

// scale9Grid: the non-stretching center, inset BORDER on every side.
const GRID = { x: BORDER, y: BORDER, width: NATURAL - BORDER * 2, height: NATURAL - BORDER * 2 };

// Placement and scale. After scaling, the panel spans NATURAL*SCALE on each axis.
const PANEL_X = 120;
const PANEL_Y = 90;
const SCALE = 8; // 60 → 480 px per axis
const PANEL_W = NATURAL * SCALE;
const PANEL_H = NATURAL * SCALE;

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [Scale9ShapeKind],
});

const root = createDisplayContainer();

const panel = createScale9Shape(GRID);
// Outer frame fills the whole NATURAL box in the border color.
appendShapeBeginFill(panel, BORDER_COLOR, 1);
appendShapeRectangle(panel, 0, 0, NATURAL, NATURAL);
appendShapeEndFill(panel);
// Inner fill sits inside the frame, inset by BORDER on every side. Its rect lies on the scale9 center,
// so it stretches with the panel; the surrounding BORDER ring is edge/corner slices that do not.
appendShapeBeginFill(panel, FILL_COLOR, 1);
appendShapeRectangle(panel, BORDER, BORDER, NATURAL - BORDER * 2, NATURAL - BORDER * 2);
appendShapeEndFill(panel);

panel.x = PANEL_X;
panel.y = PANEL_Y;
panel.scaleX = SCALE;
panel.scaleY = SCALE;
invalidateNodeLocalTransform(panel);

addNodeChild(root, panel);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const cx = PANEL_X + PANEL_W / 2;
  const cy = PANEL_Y + PANEL_H / 2;

  // 1) A wide band of interior points are all the fill color — the center stretched to fill the panel.
  // Sample across ±35% of the panel extent from center; these are well inside the border ring.
  const interiorOffsets = [-0.35, -0.18, 0, 0.18, 0.35];
  for (const ox of interiorOffsets) {
    for (const oy of interiorOffsets) {
      const px = cx + ox * PANEL_W;
      const py = cy + oy * PANEL_H;
      const rgb = at(px, py);
      if (!isFill(rgb)) {
        throw new Error(
          `[scale9-stretch] interior point (${Math.round(px)},${Math.round(py)}) not fill color — got #${hex(rgb)}`,
        );
      }
    }
  }

  // 2) The border color is present just inside each edge — the frame survived the stretch on all four sides.
  // Sample BORDER/2 px in from each edge, at the midpoint of that edge.
  const inset = BORDER / 2;
  const top = at(cx, PANEL_Y + inset);
  if (!isBorder(top)) {
    throw new Error(`[scale9-stretch] top edge not border color — got #${hex(top)}`);
  }
  const bottom = at(cx, PANEL_Y + PANEL_H - inset);
  if (!isBorder(bottom)) {
    throw new Error(`[scale9-stretch] bottom edge not border color — got #${hex(bottom)}`);
  }
  const left = at(PANEL_X + inset, cy);
  if (!isBorder(left)) {
    throw new Error(`[scale9-stretch] left edge not border color — got #${hex(left)}`);
  }
  const right = at(PANEL_X + PANEL_W - inset, cy);
  if (!isBorder(right)) {
    throw new Error(`[scale9-stretch] right edge not border color — got #${hex(right)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isFill(rgb: number): boolean {
  // yellow: high red, high green, low blue.
  return channel(rgb, 16) > 180 && channel(rgb, 8) > 180 && channel(rgb, 0) < 90;
}
function isBorder(rgb: number): boolean {
  // blue: low red, low green, high blue.
  return channel(rgb, 16) < 90 && channel(rgb, 8) < 90 && channel(rgb, 0) > 180;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
