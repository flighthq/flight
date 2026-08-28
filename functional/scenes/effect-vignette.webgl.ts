import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  createVignetteEffect,
  defaultGlShapeRenderer,
  registerGlVignetteEffect,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'The entire 800×600 field is one pale blue-white fill (authored R232 G236 B244) with a smooth ' +
    'radial darkening toward every edge and corner. The centre remains close to the authored bright ' +
    'colour while the corner luminance is more than 20 levels darker. There are no objects, borders, ' +
    'bands or abrupt steps: only the continuous centre-to-edge falloff. The corners are not the same ' +
    'brightness as the centre, and no background shows through.',
);

// Vignette: a full-bleed bright fill darkened toward the corners. The center stays bright while the
// edges fall off, so the radial darkening is obvious against the flat fill.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x101014ff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlVignetteEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

// The vignette parameters the effect is given AND the shape the assertion checks. One set of constants
// so the descriptor and the oracle cannot drift apart: an assertion holding its own copy of 0.7 keeps
// passing after the scene changes. `radius` and `softness` are in the Gl recipe's normalized distance,
// where 0 is the centre and 1.0 is the frame corner.
const VIGNETTE_RADIUS = 0.7;
const VIGNETTE_SOFTNESS = 0.5;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [
    createVignetteEffect({ intensity: 1, radius: VIGNETTE_RADIUS, softness: VIGNETTE_SOFTNESS }),
  ]);
}

// A single full-bleed bright fill covering the whole frame. With a flat, even color the vignette's
// corner darkening is the only variation in the image.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const fill = createShape();
appendShapeBeginFill(fill, 0xe8ecf4ff, 1);
appendShapeRectangle(fill, 0, 0, logicalWidth, logicalHeight);
appendShapeEndFill(fill);
addNodeChild(root, fill);

render(root);

// Vignette darkens edges while preserving the center. The uniform fill (0xe8ecf4ff, luminance ~234)
// fills the entire frame. The center pixel should remain bright while corner pixels should be
// darkened by the vignette. Without the effect, center and corner luminances are equal, so the
// gap is 0 and fails the > 20 check.
export function assertRender(frame: Readonly<Bitmap>): void {
  function luminanceAt(x: number, y: number): number {
    const rgb = getBitmapPixelRgb(frame, x, y);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // The scene is one flat fill, so luminance reads the vignette mask directly. Distance is the Gl
  // recipe's: d = length(uv - 0.5) * sqrt(2), so d = 1.0 at the corner, and a point at distance d on the
  // horizontal centre line sits at x = 0.5*W + (d/sqrt(2))*W.
  const probeAt = (d: number): number =>
    luminanceAt(Math.round(frame.width * (0.5 + d / Math.SQRT2)), Math.round(frame.height / 2));

  const center = luminanceAt(Math.round(frame.width / 2), Math.round(frame.height / 2));
  const rampStart = probeAt(VIGNETTE_RADIUS - VIGNETTE_SOFTNESS);
  const rampMid = probeAt(VIGNETTE_RADIUS - VIGNETTE_SOFTNESS / 2);
  const atRadius = probeAt(VIGNETTE_RADIUS);

  if (center <= 20) {
    throw new Error(`[effect-vignette] centre is dark (luminance ${center.toFixed(1)}) — the fill did not render`);
  }

  // ★ THE ENDPOINT IS THE CLAIM, NOT THE PRESENCE OF DARKENING. The previous oracle asked only for a
  // centre-to-corner gap above 20. A mask whose full-dark point sat at the frame CORNER instead of at
  // `radius` cleared that by more than 200 levels while being wrong in exactly the way that matters:
  // `softness` alone set the visible falloff and `radius` was not independently observable. Probing AT
  // radius is what separates the two, so this is the assertion that would have failed the old canvas
  // recipe and passes the corrected one.
  if (atRadius > center * 0.08) {
    throw new Error(
      `[effect-vignette] at the vignette radius (d=${VIGNETTE_RADIUS}) luminance is ` +
        `${atRadius.toFixed(1)}, expected <= ${(center * 0.08).toFixed(1)} (8% of the ${center.toFixed(1)} ` +
        `centre) — full darkening must arrive AT radius, not further out at the frame corner`,
    );
  }

  // Inside the ramp the picture is untouched: radius - softness is where darkening starts, not where it
  // has already begun.
  if (rampStart < center * 0.9) {
    throw new Error(
      `[effect-vignette] at the ramp start (d=${(VIGNETTE_RADIUS - VIGNETTE_SOFTNESS).toFixed(2)}) luminance ` +
        `is ${rampStart.toFixed(1)}, expected >= ${(center * 0.9).toFixed(1)} — darkening begins before ` +
        `radius - softness, so the ramp is wider than softness asks for`,
    );
  }

  // Halfway through the ramp, smoothstep is exactly 0.5, so half the darkening has been applied. This is
  // what makes the EASING observable rather than just the two endpoints.
  if (rampMid < center * 0.35 || rampMid > center * 0.65) {
    throw new Error(
      `[effect-vignette] mid-ramp luminance ${rampMid.toFixed(1)} is outside ` +
        `${(center * 0.35).toFixed(1)}..${(center * 0.65).toFixed(1)} — the falloff is not the smoothstep ` +
        `half-darkening the recipe specifies at this distance`,
    );
  }
}
