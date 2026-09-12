import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  createChannelMixerAdjustment,
  createDisplayObject,
  createShape,
  createWgpuAcquisitionFromCanvasElement,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerRenderer,
  renderWgpuScene2D,
  scene3DWgpuPipeline,
  ShapeKind,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 field completely covered by a 3-by-2 grid of six flat colour blocks, each W/3 x H/2 = 266.7 x 300 ' +
    'px, no background visible — block centres at x = 133.3, 400 and 666.7 and y = 150 and 450. The colours are ' +
    'NOT the ones the shapes were filled with — every block has had its red, green and blue channels rotated, so ' +
    'the top-left block, filled orange, renders as a GREEN-DOMINANT colour with little red in it. A top-left ' +
    'block that still reads orange means the channel rotation did not run, which is the failure. Each block is ' +
    'flat with hard straight edges, no gradient inside it and no blending where two meet.',
);
// Wgpu parity column for the same full-frame channelMixer grade as render.webgl.ts: rotates the RGB channels (R<-B, G<-R, B<-G) via a 3x4 row-major mix matrix.
// Wgpu render-state init is async (createWgpuRenderState returns a Promise). The effect pipeline
// runs between renderWgpuBackground (opens the encoder + canvas pass) and submitWgpuRenderPass
// (flushes it), grading the rgba8 scene target.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisitionFromCanvasElement(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x20 / 0xff, 0x28 / 0xff, 0x30 / 0xff, 1], depth: 1.0 } as const;
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline, screenClear);
  renderWgpuScene2D(scenePass, root);
  endWgpuRenderEffectPipeline(scenePass, pipeline, [
    createChannelMixerAdjustment({
      matrix: [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    }),
  ]);
  endWgpuRenderPass(pass);
}

registerWgpuFunctionalTarget(state, screen, scale);

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
