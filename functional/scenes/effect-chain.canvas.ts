import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginCanvasRenderEffectPipeline,
  createBloomEffect,
  createCanvasElement,
  createCanvasRenderSurface,
  createCanvasTextureResolvers,
  createCanvasRenderEffectPipeline,
  createCanvasRenderState,
  createColorGradeAdjustment,
  createDisplayObject,
  createShape,
  getBitmapPixelRgb,
  createVignetteEffect,
  registerCanvasBloomEffect,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  registerCanvasVignetteEffect,
  endCanvasRenderEffectPipeline,
  prepareScene2DRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
  scene2dCanvasPipeline,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'An 800x600 field on a near-black background with four tiles 140 px on a side, turned 12, 32, 52 and 72 ' +
    'degrees so they span 166, 193, 197 and 176 px corner to corner (side*(cos a + sin a)) — white near ' +
    '(224,180), warm yellow near (576,180), cyan near (224,420), pink near (576,420) — carrying THREE stacked ' +
    'treatments at once, and all three must be visible together. Each tile glows softly outward past its ' +
    'edges into the dark background. The colours come out LESS saturated than their raw fills, not more: ' +
    'bloom runs FIRST and adds light into each bright core, which pulls every channel toward white, and the ' +
    'grade that follows amplifies what is left rather than recovering what the addition removed. Measured on ' +
    'the warm yellow tile, whose blue channel has the most room to be lifted, the core reads about ' +
    '(181,181,134) for a saturation of 0.26 against a raw fill of 0.64. The pink tile, whose channels sit ' +
    'further apart, still comes out above its fill at 0.73. And the field is DARKENED TOWARD ITS CORNERS: the ' +
    'four corners are noticeably darker than the centre. Any one of the three missing is a failure — crisp ' +
    'tile edges, a yellow core still at its raw saturation, or uniform brightness corner-to-centre each mean ' +
    'one stage of the chain did not run. A yellow core MORE saturated than its fill would mean the passes ran ' +
    'in the other order, grade before bloom, which measures 0.84 and is a different pipeline from the one ' +
    'this scene demonstrates. The tiles keep their positions and their hues throughout.',
);
// Canvas parity column for the same three-scene2d chain as render.webgl.ts: bloom, then color grade,
// then vignette. The Canvas pipeline composites each registered runner in order over the scene, the
// same RenderEffect stack intent realized with Canvas 2D compositing.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(webCanvasRenderSurfaceCreator, 800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(
  createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, {
    height: canvas.height / pixelRatio,
    pixelRatio,
    width: canvas.width / pixelRatio,
  }),
  scene2dCanvasPipeline,
  createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  { pixelRatio, backgroundColor: 0x05060aff },
);
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerCanvasBloomEffect(state);
registerCanvasVignetteEffect(state);

const pipeline = createCanvasRenderEffectPipeline(state);

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginCanvasRenderEffectPipeline(state, pipeline);
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
  endCanvasRenderEffectPipeline(state, pipeline, [
    createBloomEffect({ threshold: 0.6, intensity: 1.2 }),
    createColorGradeAdjustment({ saturation: 1.4, contrast: 1.1 }),
    createVignetteEffect({ intensity: 0.7, radius: 0.7, softness: 0.5 }),
  ]);
}

// Bright, saturated shapes on a near-black field feed a three-scene2d effect chain: their high
// luminance crosses the bloom threshold for a glowing halo, the color grade pushes saturation and
// contrast, and the vignette darkens the corners.

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

// ★ READ OFF THE SOURCE: three stacked treatments — a bloom, a colour grade at saturation 1.4 /
// contrast 1.1, and a vignette at intensity 0.7 — and the description names each one's own failure.
// Two of the three are asserted below. The third is not, and the reason is recorded rather than left
// as a gap.
//
// 1. BLOOM — the gradient population, pixels that are neither background nor tile core. Measured here:
//    0.68 of the lit population on canvas, 0.52 on Gl and Wgpu. The same frame with no bloom collapses
//    to about 0.014, so the bar of 0.1 sits five times below the working case and seven times above a
//    frame without it.
//
// 2. VIGNETTE — the field must darken toward its corners. Measured: corner luminance 0.33 against 0.67
//    in the middle of the field, on all three backends. A missing vignette leaves the two equal.
//
// 3. SATURATION — the yellow tile's core must come out LESS saturated than its raw fill. Bloom runs
//    first and adds light into the core, which pulls the channels toward white; the grade that follows
//    amplifies what is left rather than recovering it. Measured 0.26 against a raw 0.64, on all three
//    backends since the canvas bloom was rebuilt.
//
//    ★ THIS CLAIM WAS LEFT UNASSERTED UNTIL IT WAS MEASURED BOTH WAYS. The description used to say the
//    colours came out MORE saturated, and canvas appeared to satisfy that at 0.91 while Gl read 0.26 —
//    but only because the old canvas bright pass dropped the blue channel entirely. With that fixed the
//    three backends agree and the old sentence is simply false. The ordering was then probed too:
//    grade-then-bloom reads 0.84, above the fill, so the claim was achievable by a DIFFERENT pipeline.
//    Bloom-then-grade is the canonical order, so the recipe stayed and the prose changed.
//
//    The upper bound is what makes this positional rather than a restatement: a picture that came out
//    more saturated than its fill would be the other pass order, which is a different pipeline from the
//    one this scene demonstrates.
const MID_BAND_LOW = 15;
const MID_BAND_HIGH = 120;
const MIN_GRADIENT_RATIO = 0.1;
const MIN_VIGNETTE_RATIO = 1.5;
const MAX_YELLOW_SATURATION = 0.45;

export function assertRender(frame: Readonly<Bitmap>): void {
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, x, y);
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
      `[effect-chain] the gradient population is ${ratio.toFixed(3)} of the lit population (expected at ` +
        `least ${MIN_GRADIENT_RATIO}) — the tiles have crisp edges, so the bloom stage did not run`,
    );
  }

  // Field background only: the two corners and a point in the middle gap between the four tiles.
  const corner = (luminance(12, 12) + luminance(frame.width - 12, frame.height - 12)) / 2;
  const middle = luminance(Math.round(frame.width * 0.5), Math.round(frame.height * 0.5));
  if (middle < corner * MIN_VIGNETTE_RATIO) {
    throw new Error(
      `[effect-chain] the corners read ${corner.toFixed(2)} and the middle of the field ` +
        `${middle.toFixed(2)} — the field is not darkening toward its corners, so the vignette stage ` +
        `did not run`,
    );
  }

  // 3. the grade cannot recover what the bloom added — see the note above for why this is an upper bound
  const yellow = at(Math.round(frame.width * 0.72), Math.round(frame.height * 0.3));
  const channels = [(yellow >> 16) & 255, (yellow >> 8) & 255, yellow & 255];
  const peak = Math.max(...channels);
  const saturation = peak === 0 ? 0 : (peak - Math.min(...channels)) / peak;
  if (saturation > MAX_YELLOW_SATURATION) {
    throw new Error(
      `[effect-chain] the yellow tile core is ${saturation.toFixed(3)} saturated (expected at most ` +
        `${MAX_YELLOW_SATURATION}, against a raw fill of 0.64) — bloom runs before the grade here, so a ` +
        `MORE saturated core means the passes ran grade-first, a different pipeline from this one`,
    );
  }
}
