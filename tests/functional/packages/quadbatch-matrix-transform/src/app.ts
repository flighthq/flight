// quadbatch-matrix-transform — validates the QuadBatch `matrix3x2` transform layout: per-quad AFFINE
// transforms (rotation, scale, skew), not just translation.
//
// quadbatch-grid covers the `vector2` layout (stride 2: [x,y] — translation only). This test covers the
// other QuadTransformType, `matrix3x2` (stride 6: [a,b,c,d,tx,ty]), where each quad carries a full 2D
// affine matrix that maps the region's local rect (0,0)-(W,W) onto the screen. A renderer that only honored
// translation, mis-ordered the matrix slots, or dropped the rotate/scale terms would draw both quads as
// plain axis-aligned squares — a difference only a visual/pixel oracle can catch. The scene draws ONE batch
// of TWO quads sharing a single solid-red region: quad A rotated 45° about its own center (it should render
// as a diamond, with its un-rotated corners now outside the footprint), and quad B scaled 2× (it should
// cover a footprint twice as wide/tall as the source region). The oracle samples each quad's center, an
// interior point only reachable if the affine term was applied, and an exterior point that must stay
// background.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createDisplayContainer,
  createImageResource,
  createQuadBatch,
  createRectangle,
  createTextureAtlas,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
  QuadBatchKind,
  setQuadBatchLocalBoundsRectangle,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// One QUAD x QUAD solid-red atlas region (region id 0); both quads reference it.
const QUAD = 60;

// Quad A: rotated 45° about its own center, centered at this screen point.
const A_CENTER_X = 200;
const A_CENTER_Y = 200;

// Quad B: scaled 2×, with its (local-origin) top-left landing at this screen point.
const B_ORIGIN_X = 500;
const B_ORIGIN_Y = 150;

const COS45 = Math.SQRT1_2; // ≈ 0.7071
const SIN45 = Math.SQRT1_2;

// Half-diagonal of the QUAD-sized square; the rotated quad becomes a diamond whose vertices sit this far
// from its center along the screen axes (W * √2 / 2).
const A_HALF_DIAGONAL = (QUAD * Math.SQRT2) / 2; // ≈ 42.43

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [QuadBatchKind],
});

// Build a single solid-red atlas region.
function makeRedCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = QUAD;
  c.height = QUAD;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgb(255,0,0)';
  ctx.fillRect(0, 0, QUAD, QUAD);
  return c;
}

const atlas = createTextureAtlas({ image: createImageResource(makeRedCanvas()) });
addTextureAtlasRegion(atlas, 0, 0, QUAD, QUAD); // region id 0 — red

// Quad A matrix: rotate 45° about the region center, then place that center at (A_CENTER_X, A_CENTER_Y).
// M = T(center) · R(45°) · T(-W/2, -W/2). For matrix3x2 slots [a,b,c,d,tx,ty]:
//   a=cos, b=sin, c=-sin, d=cos; tx/ty offset the center by R·(W/2, W/2).
const aTx = A_CENTER_X - (COS45 * (QUAD / 2) - SIN45 * (QUAD / 2));
const aTy = A_CENTER_Y - (SIN45 * (QUAD / 2) + COS45 * (QUAD / 2));

// Quad B matrix: uniform 2× scale, no rotation. Local (0,0) maps to (B_ORIGIN_X, B_ORIGIN_Y); the region
// covers (B_ORIGIN_X, B_ORIGIN_Y)..(B_ORIGIN_X + 2W, B_ORIGIN_Y + 2W).
//   [a,b,c,d,tx,ty] = [2,0,0,2, B_ORIGIN_X, B_ORIGIN_Y].

const root = createDisplayContainer();

const batch = createQuadBatch();
batch.data.atlas = atlas;
batch.data.transformType = 'matrix3x2'; // stride 6: [a,b,c,d, tx,ty] per quad
batch.data.instanceCount = 2;
batch.data.ids = new Uint16Array([0, 0]); // both quads use region 0 (red)
// prettier-ignore
batch.data.transforms = new Float32Array([
  // Quad A — rotated 45° about its center:
  COS45, SIN45, -SIN45, COS45, aTx, aTy,
  // Quad B — scaled 2× at (B_ORIGIN_X, B_ORIGIN_Y):
  2, 0, 0, 2, B_ORIGIN_X, B_ORIGIN_Y,
]);

// The default QuadBatch bounds method copies the runtime rect; supply a local rect spanning the whole frame
// so the update pass does not cull the batch (matching quadbatch-grid's pattern).
setQuadBatchLocalBoundsRectangle(batch, createRectangle(0, 0, WIDTH, HEIGHT));

addNodeChild(root, batch);
invalidateNodeLocalTransform(batch);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Quad A (rotated 45° → diamond centered at A_CENTER).
  const aCenter = at(A_CENTER_X, A_CENTER_Y);
  if (!isRed(aCenter)) {
    throw new Error(
      `[quadbatch-matrix-transform] quad A center (${A_CENTER_X},${A_CENTER_Y}) not red — got #${hex(aCenter)}`,
    );
  }
  // A corner of the UN-rotated square is at (center+W/2, center-W/2): a diagonal point at L1 distance W from
  // the center (60), beyond the diamond's half-diagonal (≈42.43). After rotation it falls OUTSIDE → background.
  const aCutX = A_CENTER_X + QUAD / 2;
  const aCutY = A_CENTER_Y - QUAD / 2;
  const aCut = at(aCutX, aCutY);
  if (!isBackground(aCut)) {
    throw new Error(
      `[quadbatch-matrix-transform] quad A pre-rotation corner (${aCutX},${aCutY}) not background — ` +
        `rotation may not have been applied — got #${hex(aCut)}`,
    );
  }
  // The diamond's vertical extreme: directly above the center, inside the diamond (distance 35 < ≈42.43). For
  // an axis-aligned square this point would be outside the top edge (>W/2=30), so red here proves the rotate.
  const aTopX = A_CENTER_X;
  const aTopY = A_CENTER_Y - 35;
  const aTop = at(aTopX, aTopY);
  if (!isRed(aTop)) {
    throw new Error(
      `[quadbatch-matrix-transform] quad A diamond vertical extreme (${aTopX},${aTopY}) not red — ` +
        `rotation may not have been applied — got #${hex(aTop)}`,
    );
  }
  void A_HALF_DIAGONAL;

  // Quad B (scaled 2× → covers (B_ORIGIN)..(B_ORIGIN + 2W)).
  const bCenterX = B_ORIGIN_X + QUAD; // center of the 2W-wide footprint
  const bCenterY = B_ORIGIN_Y + QUAD;
  const bCenter = at(bCenterX, bCenterY);
  if (!isRed(bCenter)) {
    throw new Error(
      `[quadbatch-matrix-transform] quad B center (${bCenterX},${bCenterY}) not red — got #${hex(bCenter)}`,
    );
  }
  // A point inside the EXPANDED footprint but beyond where an unscaled quad would reach. Unscaled, the quad
  // would end at B_ORIGIN_X + W (560); scaled 2× it reaches B_ORIGIN_X + 2W (620). Sample x=600 → red only
  // if the 2× scale was applied.
  const bEdgeX = B_ORIGIN_X + QUAD + 40; // 600 — past the unscaled extent (560), inside the scaled one (620)
  const bEdgeY = B_ORIGIN_Y + QUAD;
  const bEdge = at(bEdgeX, bEdgeY);
  if (!isRed(bEdge)) {
    throw new Error(
      `[quadbatch-matrix-transform] quad B expanded footprint (${bEdgeX},${bEdgeY}) not red — ` +
        `2× scale may not have been applied — got #${hex(bEdge)}`,
    );
  }
  // Well beyond even the scaled footprint → background.
  const bOutX = B_ORIGIN_X + 2 * QUAD + 40; // 660 — past the scaled right edge (620)
  const bOutY = B_ORIGIN_Y + QUAD;
  const bOut = at(bOutX, bOutY);
  if (!isBackground(bOut)) {
    throw new Error(
      `[quadbatch-matrix-transform] quad B exterior (${bOutX},${bOutY}) not background — got #${hex(bOut)}`,
    );
  }

  void height;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 90 && channel(rgb, 0) < 90;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
