import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createBloomEffect,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  getBitmapPixelRgb,
  registerGlBloomEffect,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

// Bloom: bright shapes on a dark background bleed glow through an HDR (rgba16f) pipeline. Pixels above
// the bright-pass threshold blur and add back, so the lit shapes gain a soft halo.
declareExpectedImageDescription(
  'An 800x600 field on a near-black background with four square tiles 140 px on a side, turned 12, 32, 52 and ' +
    '72 degrees so none sits square to the edges — a turned square covers more than its side, so they span 166, ' +
    '193, 197 and 176 px corner to corner (side*(cos a + sin a)): white centred near (224,180), warm yellow near ' +
    '(576,180), cyan near (224,420) and pink near (576,420). Each tile is bright and saturated at its core and ' +
    'carries a SOFT GLOW spilling outward past its edges into the dark background — the halo is the point, so ' +
    'four crisp-edged tiles with the background pure and unlit right up to each edge is the failure. The glow ' +
    'falls off gradually rather than stopping at a line, it is the tile own colour rather than white, and it does ' +
    'not fill the field: the middle of the picture between the four tiles stays dark. The tiles do not overlap ' +
    'each other.',
);
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x05060aff,
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlBloomEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createBloomEffect({ threshold: 0.6, intensity: 1.4 })]);
}

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xfff05cff, 0x5cffe0ff, 0xff5ce0ff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -70, -70, 140, 140);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.28 + 0.44 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.4 * Math.floor(i / 2));
  shape.rotation = 12 + i * 20;
  addNodeChild(root, shape);
}

render(root);

// ★ READ OFF THE SOURCE: the scene draws four bright rotated tiles on a near-black field and applies a
// bloom at threshold 0.6, intensity 1.4. The description's central claim is that each tile carries a
// SOFT GLOW spilling past its edges, and it names its own failure — "four crisp-edged tiles with the
// background pure and unlit right up to each edge".
//
// So the check counts the GRADIENT POPULATION: pixels that are neither background nor tile core. A
// rotated tile without bloom still has an antialiased rim, so the question is not whether intermediate
// pixels exist but how MANY. Measured on this scene with the bloom running: 20485 mid-band pixels on
// canvas, 23103 on Gl, 22880 on Wgpu, against 78-82k lit pixels. With intensity set to 0 as a control,
// the same frame drops to 1100 — the antialiased rim alone. A ratio of 0.10 sits 2.6x below the working
// backends and 7x above the control.
//
// The two other claims are checked because a bright generic glow would satisfy the first one alone: the
// halo must carry the TILE'S colour rather than white, and it must not fill the field.
const MID_BAND_LOW = 15;
const MID_BAND_HIGH = 120;
const MIN_GRADIENT_RATIO = 0.1;
const MIN_HUE_SEPARATION = 10;
const MAX_FIELD_CENTRE_LUMINANCE = 15;

export function assertRender(frame: Readonly<Bitmap>): void {
  const luminance = (x: number, y: number): number => {
    const rgb = getBitmapPixelRgb(frame, x, y);
    return (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
  };

  let gradient = 0;
  let lit = 0;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const value = luminance(x, y);
      if (value > MID_BAND_LOW && value < MID_BAND_HIGH) gradient++;
      else if (value >= MID_BAND_HIGH) lit++;
    }
  }

  const ratio = gradient / Math.max(1, lit);
  if (ratio < MIN_GRADIENT_RATIO) {
    throw new Error(
      `[effect-bloom] the gradient population is ${ratio.toFixed(3)} of the lit population (expected at ` +
        `least ${MIN_GRADIENT_RATIO}) — the tiles have crisp edges with the background unlit right up ` +
        `to them, which is this scene's own stated failure`,
    );
  }

  // Just outside the yellow tile at (0.72, 0.3): its glow must be YELLOW, so red and green both stand
  // clear of blue. A white bloom, or a bloom that lost the source colour, collapses that separation.
  const haloRgb = getBitmapPixelRgb(frame, Math.round(frame.width * 0.83), Math.round(frame.height * 0.3));
  const haloRed = (haloRgb >> 16) & 255;
  const haloGreen = (haloRgb >> 8) & 255;
  const haloBlue = haloRgb & 255;
  if (haloRed - haloBlue < MIN_HUE_SEPARATION || haloGreen - haloBlue < MIN_HUE_SEPARATION) {
    throw new Error(
      `[effect-bloom] the halo beside the yellow tile is #${(haloRgb & 0xffffff).toString(16).padStart(6, '0')} ` +
        `— red and green must each stand at least ${MIN_HUE_SEPARATION} clear of blue, because the glow ` +
        `carries the tile's own colour rather than white`,
    );
  }

  const centre = luminance(Math.round(frame.width * 0.5), Math.round(frame.height * 0.5));
  if (centre > MAX_FIELD_CENTRE_LUMINANCE) {
    throw new Error(
      `[effect-bloom] the middle of the field reads ${centre.toFixed(1)} (expected at most ` +
        `${MAX_FIELD_CENTRE_LUMINANCE}) — the glow is filling the picture instead of staying near the tiles`,
    );
  }
}
