import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createChannelMixerAdjustment,
  createDisplayObject,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for the same full-frame channelMixer grade as render.webgl.ts: rotates the RGB channels (R<-B, G<-R, B<-G) via a 3x4 row-major mix matrix.
// Wgpu render-state init is async (createWgpuRenderState returns a Promise). The effect pipeline
// runs between renderWgpuBackground (opens the encoder + canvas pass) and submitWgpuRenderPass
// (flushes it), grading the rgba8 scene target.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x202830ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createChannelMixerAdjustment({
      matrix: [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Distinct saturated-color shapes filling the frame, suited to showing a full-frame color grade:
// rotates the RGB channels (R<-B, G<-R, B<-G) via a 3x4 row-major mix matrix.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff8020, 0x30c040, 0x3060ff, 0xffd030, 0xff30c0, 0x30d0d0];
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
