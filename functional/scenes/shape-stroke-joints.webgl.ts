// WebGL now differentiates join styles: a stroke-only shape resolves through getShapeStrokeRegions →
// strokePath (real miter/bevel/round joins) and tessellates to GPU meshes, instead of the old offscreen
// Canvas-2D raster whose miter spike was clipped by the strokeHalf-sized bounds. So this backend-agnostic
// join proof now runs on webgl alongside canvas/dom (wgpu variant to follow when its shape renderer is
// wired the same way).
//
// shape-stroke-joints — validates the three line-join styles ('round'/'bevel'/'miter') at a sharp
// corner. Three identical V-shaped white polylines (thickness 30) are drawn — moveTo top-left, lineTo a
// bottom-center apex, lineTo top-right — a sharp downward corner. They differ only in joint style, which
// controls how the OUTER side of the corner (below the apex) is filled:
//   - 'miter': the two outer edges are extended until they meet in a sharp point past the apex.
//   - 'bevel': the outer corner is cut flat by a chord across the two edge endpoints — no point.
//   - 'round': the outer corner is filled by a circular arc of radius half-thickness around the apex.
//
// This is visual: joins are extra geometry generated only at corners by a real rasterizer. The scene assertion
// reads two depths straight below the apex along the corner's bisector. The 90° corner with thickness 30
// (half = 15) yields: bevel chord ends ~10.6px past the apex, the round arc ~15px, and the miter point
// ~21px. A shallow sample (apex.y + 12.5) separates round (white) from bevel (background); a deeper
// sample (apex.y + 18) separates miter (white) from both round and bevel (background).
import type { Bitmap } from '@flighthq/sdk';
import type { JointStyle } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  createDisplayObject,
  createShape,
  getBitmapPixelRgb,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const THICKNESS = 30; // half-thickness = 15 — the join-geometry scale; larger thickness widens margins.

// A symmetric V with a 90° corner: legs span ±110 horizontally and 110 vertically up from the apex.
// The bisector points straight down (+x = APEX_X), so all outer-corner geometry lies on x = APEX_X.
const LEG_DX = 110;
const LEG_DY = 110;
const APEX_X = 400;

// Three V's stacked vertically, each apex well clear of its neighbors.
const ROUND_APEX_Y = 200;
const BEVEL_APEX_Y = 360;
const MITER_APEX_Y = 520;

declareAntialiasingPolicy('aa');

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  expectedImageDescription:
    'On an 800×600 pure-black field, three pure-white 30-pixel V strokes have downward apices at ' +
    '(400,200), (400,360), and (400,520). Each centerline extends 110 pixels left/right and 110 pixels ' +
    'up from its apex, ending at x=290 and x=510. The round top reaches y=215 (200 + 30/2), the flat ' +
    'middle reaches about y=371 (360 + (30/2)/√2), and the sharp bottom reaches about y=541 ' +
    '(520 + (30/2)×√2). Their interiors and surroundings remain black, with no fill or gradient.',
  kinds: [ShapeKind],
});

const root = createDisplayObject();

function vShape(apexY: number, joint: JointStyle): void {
  const shape = createShape();
  // caps 'none' (irrelevant here — leg ends are off-corner); miterLimit 6 is high enough that the 90°
  // corner's miter ratio (~1.41) is never clamped.
  appendShapeLineStyle(shape, THICKNESS, 0xffffffff, 1, false, 'normal', 'none', joint, 6);
  appendShapeMoveTo(shape, APEX_X - LEG_DX, apexY - LEG_DY); // top-left
  appendShapeLineTo(shape, APEX_X, apexY); // bottom-center apex (sharp corner)
  appendShapeLineTo(shape, APEX_X + LEG_DX, apexY - LEG_DY); // top-right
  addNodeChild(root, shape);
}

vShape(ROUND_APEX_Y, 'round');
vShape(BEVEL_APEX_Y, 'bevel');
vShape(MITER_APEX_Y, 'miter');

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Each V's left leg has a solid white shoulder; sample its midpoint to confirm the stroke drew at all.
  for (const [label, apexY] of [
    ['round', ROUND_APEX_Y],
    ['bevel', BEVEL_APEX_Y],
    ['miter', MITER_APEX_Y],
  ] as const) {
    const legMid = at(APEX_X - LEG_DX / 2, apexY - LEG_DY / 2);
    if (!isWhite(legMid)) {
      throw new Error(`[shape-stroke-joints] ${label} V left-leg shoulder not white — got #${hex(legMid)}`);
    }
  }

  // Outer-corner samples lie on the bisector x = APEX_X, at increasing depth past each apex.
  // Depth 12.5: past the bevel chord (~10.6) but inside the round arc (~15) and miter point (~21).
  const SHALLOW = 12.5;
  // Depth 18: past the round arc (~15) but inside the miter point (~21).
  const DEEP = 18;

  // 'bevel' — flat-cut corner: background at the shallow depth (chord already ended).
  const bevelShallow = at(APEX_X, BEVEL_APEX_Y + SHALLOW);
  if (!isBackground(bevelShallow)) {
    throw new Error(
      `[shape-stroke-joints] 'bevel' corner extends past chord — got #${hex(bevelShallow)} (expected bg)`,
    );
  }

  // 'round' — arc fills the shallow depth (white) but falls off before the deep depth (background).
  const roundShallow = at(APEX_X, ROUND_APEX_Y + SHALLOW);
  if (!isWhite(roundShallow)) {
    throw new Error(`[shape-stroke-joints] 'round' corner arc missing — got #${hex(roundShallow)} (expected white)`);
  }
  const roundDeep = at(APEX_X, ROUND_APEX_Y + DEEP);
  if (!isBackground(roundDeep)) {
    throw new Error(`[shape-stroke-joints] 'round' corner extends past arc — got #${hex(roundDeep)} (expected bg)`);
  }

  // 'miter' — sharp point reaches the deep depth (white), clearly past both round and bevel.
  const miterDeep = at(APEX_X, MITER_APEX_Y + DEEP);
  if (!isWhite(miterDeep)) {
    throw new Error(
      `[shape-stroke-joints] 'miter' point not extended past corner — got #${hex(miterDeep)} (expected white)`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isWhite(rgb: number): boolean {
  return channel(rgb, 16) > 200 && channel(rgb, 8) > 200 && channel(rgb, 0) > 200;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffffff).toString(16).padStart(6, '0');
}
