// node-blend-modes — validates that a node's blendMode changes how it composites against what is beneath it.
// Backend support for blend modes is uneven: Canvas (globalCompositeOperation) and DOM (CSS
// mix-blend-mode) support the full separable set; WebGL uses fixed-function blend state and supports
// Normal/Layer + Add (additive); WebGPU bakes blend into the immutable render pipeline and currently does
// not honor per-node blendMode at all. So the mode whose effect is real on every backend that supports
// blending is Add — this test runs on canvas/dom/webgl (see package.json `renderers`; webgpu is excluded
// because it ignores blendMode) and asserts Add.
//
// The proof is a same-source-color comparison: the SAME overlay color is drawn over a gray base twice,
// once in Normal mode and once in Add mode. Normal shows the overlay color opaquely; Add sums it with the
// base, so the Add region is markedly brighter than the Normal region. A renderer that ignored blendMode
// would draw both regions identically, failing the test. (The full Multiply/Screen/Darken/... equations,
// which only Canvas/DOM implement, are covered by node-blend-modes-advanced.)
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  BlendMode,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  invalidateNodeAppearance,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const BASE_GRAY = 0x808080; // luma ≈ 128
const OVERLAY = 0x505050; // luma ≈ 80 — darker than the base, so Normal-mode draws DARKER, Add draws BRIGHTER
const BAND_X = 100;
const BAND_Y = 200;
const BAND_W = 600;
const BAND_H = 200;

const OVERLAY_Y = 240;
const OVERLAY_H = 120;
const OVERLAY_W = 180;

// Two overlay columns inside the base band: one Normal (control), one Add. Same source color.
const NORMAL_X = 180;
const ADD_X = 440;

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
  blend: true, // opt into per-node blend-mode compositing (enable*BlendModeSupport)
});

const root = createDisplayContainer();

const base = createShape();
appendShapeBeginFill(base, BASE_GRAY, 1);
appendShapeRectangle(base, BAND_X, BAND_Y, BAND_W, BAND_H);
appendShapeEndFill(base);
addNodeChild(root, base);

addOverlay(NORMAL_X, BlendMode.Normal);
addOverlay(ADD_X, BlendMode.Add);

render(root);

function addOverlay(x: number, blendMode: BlendMode): void {
  const overlay = createShape();
  appendShapeBeginFill(overlay, OVERLAY, 1);
  appendShapeRectangle(overlay, x, OVERLAY_Y, OVERLAY_W, OVERLAY_H);
  appendShapeEndFill(overlay);
  overlay.blendMode = blendMode;
  invalidateNodeAppearance(overlay);
  addNodeChild(root, overlay);
}

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));
  const overlayCenterY = OVERLAY_Y + OVERLAY_H / 2;

  // Base band (away from overlays) is gray.
  const baseLuma = luma(at(BAND_X + 20, BAND_Y + 20));
  if (baseLuma < 100 || baseLuma > 160) {
    throw new Error(`[node-blend-modes] base gray luma ${baseLuma.toFixed(0)} not near 128`);
  }

  // Normal overlay (control): the dark overlay drawn opaquely over the base ⇒ shows the overlay color
  // (luma ≈ 80), clearly DARKER than the base.
  const normalLuma = luma(at(NORMAL_X + OVERLAY_W / 2, overlayCenterY));
  if (normalLuma > baseLuma - 20) {
    throw new Error(
      `[node-blend-modes] Normal overlay luma ${normalLuma.toFixed(0)} not darker than base ${baseLuma.toFixed(0)}`,
    );
  }

  // Add overlay: the SAME color summed with the base ⇒ clearly BRIGHTER than the base, and far brighter
  // than the Normal region. This is the cross-backend proof that blendMode is applied.
  const addLuma = luma(at(ADD_X + OVERLAY_W / 2, overlayCenterY));
  if (addLuma < baseLuma + 40) {
    throw new Error(
      `[node-blend-modes] Add overlay luma ${addLuma.toFixed(0)} not brighter than base ${baseLuma.toFixed(0)}`,
    );
  }
  if (addLuma < normalLuma + 80) {
    throw new Error(
      `[node-blend-modes] Add (${addLuma.toFixed(0)}) not far brighter than Normal (${normalLuma.toFixed(0)}) for the same source color`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function luma(rgb: number): number {
  return 0.299 * channel(rgb, 16) + 0.587 * channel(rgb, 8) + 0.114 * channel(rgb, 0);
}
