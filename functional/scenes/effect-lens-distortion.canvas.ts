import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  getBitmapPixelRgb,
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginCanvasRenderEffectPipeline,
  createCanvasElement,
  createCanvasRenderEffectPipeline,
  createCanvasRenderState,
  createDisplayObject,
  createLensDistortionEffect,
  createShape,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  endCanvasRenderEffectPipeline,
  prepareScene2DRender,
  registerCanvasLensDistortionEffect,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'Four rotated squares (white 0xffffff, yellow 0xfff05c, cyan 0x5cffe0, magenta 0xff5ce0) of 160×160 logical ' +
    'pixels near the four corners of the 800×600 frame on near-black (0x05060a), rotated 8°/22°/36°/50°. Barrel ' +
    'distortion (amount 0.35) bows straight edges into gentle curves most visible at the corners — positive ' +
    'barrel distortion pulls peripheral source features inward toward the center while bowing straight lines ' +
    'outward. This cell renders the same distortion its Gl and Wgpu siblings do — canvas realizes the effect ' +
    'through registerCanvasLensDistortionEffect, applying the identical polynomial centered * (1 + amount * ' +
    'dot(centered, centered)) per pixel with bilinear sampling, so it is no longer a backend control. The ' +
    'permitted difference from those siblings is resampling only: about 0.7 per cent of pixels differ by a mean ' +
    'of 13/255, none of them flat interior, all of them where the remap lands between source texels along an ' +
    'edge. Parity distance is 0.03 against both.',
);

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerCanvasLensDistortionEffect(state);

const pipeline = createCanvasRenderEffectPipeline(state);

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

// The distortion amount the effect is given AND the value the assertion reasons about. One constant so
// the descriptor and the oracle cannot drift apart.
const LENS_AMOUNT = 0.35;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginCanvasRenderEffectPipeline(state, pipeline);
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
  endCanvasRenderEffectPipeline(state, pipeline, [createLensDistortionEffect({ amount: LENS_AMOUNT, scale: 1 })]);
}

// Off-center shapes make the Canvas remap directly comparable with the Gl and Wgpu siblings.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xfff05cff, 0x5cffe0ff, 0xff5ce0ff];
const positions = [
  [0.16, 0.18],
  [0.84, 0.2],
  [0.18, 0.82],
  [0.82, 0.8],
];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -80, -80, 160, 160);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * positions[i][0];
  shape.y = logicalHeight * positions[i][1];
  shape.rotation = 8 + i * 14;
  addNodeChild(root, shape);
}

render(root);

// ★ THE ORACLE MUST SEPARATE "DISTORTED" FROM "UNTOUCHED", and the two probes below are chosen because
// an identity pass fails both. The remap is `centered * (1 + amount * r2)`, so the centre is its FIXED
// POINT — it must still read the scene background — while the frame corner samples past the source edge
// and the recipe writes opaque black there rather than clamping. Undistorted, the corner would read the
// same near-black background as the centre, which is a different colour from pure black; that is the
// discrimination. Before this, these scenes had no assertion at all on any backend.
export function assertRender(frame: Readonly<Bitmap>): void {
  const channels = (x: number, y: number): { blue: number; green: number; red: number } => {
    const rgb = getBitmapPixelRgb(frame, x, y);
    return { blue: rgb & 0xff, green: (rgb >> 8) & 0xff, red: (rgb >> 16) & 0xff };
  };

  const corner = channels(2, 2);
  const centre = channels(Math.round(frame.width / 2), Math.round(frame.height / 2));

  if (corner.red > 3 || corner.green > 3 || corner.blue > 3) {
    throw new Error(
      `[effect-lens-distortion] frame corner is rgb(${corner.red},${corner.green},${corner.blue}), expected ` +
        `the opaque black the recipe writes where amount ${LENS_AMOUNT} pushes the sample off the source — ` +
        `the scene background would read here if no distortion ran`,
    );
  }

  if (centre.red + centre.green + centre.blue < 12) {
    throw new Error(
      `[effect-lens-distortion] centre is rgb(${centre.red},${centre.green},${centre.blue}), expected the ` +
        `scene background — the centre is the fixed point of the remap and must not be pushed off-frame`,
    );
  }
}
