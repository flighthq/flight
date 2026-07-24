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

// WebGPU parity column for the fixed-function node BlendMode set. The same dark source is drawn over
// gray using Normal and Add; immutable WGPU pipeline selection must make the Add sample much brighter.
const BASE_GRAY = 0x808080;
const OVERLAY = 0x505050;
const BAND_X = 100;
const BAND_Y = 200;
const BAND_W = 600;
const BAND_H = 200;
const OVERLAY_Y = 240;
const OVERLAY_H = 120;
const OVERLAY_W = 180;
const NORMAL_X = 180;
const ADD_X = 440;

const { render, width } = await createFunctionalTarget({
  width: 800,
  height: 600,
  background: 0x000000ff,
  kinds: [ShapeKind],
  blend: true,
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
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));
  const sampleY = OVERLAY_Y + OVERLAY_H / 2;
  const baseLuma = luma(at(BAND_X + 20, BAND_Y + 20));
  const normalLuma = luma(at(NORMAL_X + OVERLAY_W / 2, sampleY));
  const addLuma = luma(at(ADD_X + OVERLAY_W / 2, sampleY));

  if (baseLuma < 100 || baseLuma > 160) {
    throw new Error(`[node-blend-modes] base gray luma ${baseLuma.toFixed(0)} not near 128`);
  }
  if (normalLuma > baseLuma - 20) {
    throw new Error(
      `[node-blend-modes] Normal overlay luma ${normalLuma.toFixed(0)} not darker than base ${baseLuma.toFixed(0)}`,
    );
  }
  if (addLuma < baseLuma + 40 || addLuma < normalLuma + 80) {
    throw new Error(
      `[node-blend-modes] Add (${addLuma.toFixed(0)}) did not differ from Normal (${normalLuma.toFixed(0)})`,
    );
  }
}

function luma(rgb: number): number {
  return 0.299 * ((rgb >> 16) & 255) + 0.587 * ((rgb >> 8) & 255) + 0.114 * (rgb & 255);
}
