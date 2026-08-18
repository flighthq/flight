import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createChannelMixerAdjustment,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'An 800x600 field completely covered by a 3-by-2 grid of six flat colour blocks about 267 x 300 ' +
    'each, no background visible. The colours are NOT the ones the shapes were filled with — every block ' +
    'has had its red, green and blue channels rotated, so the top-left block, filled orange, renders as ' +
    'a GREEN-DOMINANT colour with little red in it. A top-left block that still reads orange means the ' +
    'channel rotation did not run, which is the failure. Each block is flat with hard straight edges, no ' +
    'gradient inside it and no blending where two meet.',
);
// Full-frame channelMixer color grade: rotates the RGB channels (R<-B, G<-R, B<-G) via a 3x4 row-major mix matrix. One config applied to the whole scene through an
// rgba8 effect pipeline (the default format for color ops, so format is omitted).
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x202830ff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [
    createChannelMixerAdjustment({
      matrix: [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    }),
  ]);
}

// Distinct saturated-color shapes filling the frame, suited to showing a full-frame color grade:
// rotates the RGB channels (R<-B, G<-R, B<-G) via a 3x4 row-major mix matrix.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff8020ff, 0x30c040ff, 0x3060ffff, 0xffd030ff, 0xff30c0ff, 0x30d0d0ff];
const cols = 3;
const rows = 2;
const cellWidth = logicalWidth / cols;
const cellHeight = logicalHeight / rows;
for (let i = 0; i < colors.length; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, 0, 0, cellWidth, cellHeight);
  appendShapeEndFill(shape);
  shape.x = col * cellWidth;
  shape.y = row * cellHeight;
  addNodeChild(root, shape);
}

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  // The channel mixer matrix [0,0,1,0, 1,0,0,0, 0,1,0,0] creates a 4×5 color matrix:
  //   R' = 0·R + 0·G + 1·B = B
  //   G' = 1·R + 0·G + 0·B = R
  //   B' = 0·R + 1·G + 0·B = G
  //
  // Cell 0 has fill color 0xff8020ff = R=255, G=128, B=32 (24-bit RGB).
  // All three channels are distinct so every permutation yields a unique triple:
  //   correct:         (32, 255, 128)
  //   not-applying:    (255, 128, 32) — input unchanged
  //   applied+R/B-swap:(128, 255, 32) — distinct from both
  const cols = 3;
  const rows = 2;
  const cx = Math.round((0.5 * frame.width) / cols);
  const cy = Math.round((0.5 * frame.height) / rows);
  const rgb = getBitmapPixelRgb(frame, cx, cy);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;

  if (g < 200) {
    throw new Error(
      `[effect-channel-mixer] cell 0 G=${g} (expected ≥200 — G'=R=255). R=${r}, B=${b}. ` +
        `Input was (255,128,32); correct output is (32,255,128).`,
    );
  }
  if (r > 80) {
    throw new Error(
      `[effect-channel-mixer] cell 0 R=${r} (expected ≤80 — R'=B=32). G=${g}, B=${b}. ` +
        `Input was (255,128,32); correct output is (32,255,128).`,
    );
  }
  if (b < 80) {
    throw new Error(
      `[effect-channel-mixer] cell 0 B=${b} (expected ≥80 — B'=G=128). R=${r}, G=${g}. ` +
        `Input was (255,128,32); correct output is (32,255,128).`,
    );
  }
}
