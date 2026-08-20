import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDirectionalBlurEffect,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  registerGlDirectionalBlurEffect,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

// Directional blur: the full frame is smeared along a fixed angle, so the mid-screen shapes
// streak uniformly in the configured direction.
declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'An 800x600 field on a near-black background with four square tiles 110 px on a side, turned 10, 28, 46 and ' +
    '64 degrees so they span 127, 149, 156 and 147 px corner to corner (side*(cos a + sin a)), marching left to ' +
    'right across the middle at x = W*(0.2 + 0.2*i) = 160, 320, 480 and 640 with y = H*(0.4 + 0.12*(i mod 2)) ' +
    'alternating between 240 and 312, the second and fourth sitting slightly lower than the first and third: ' +
    'white, warm yellow, cyan and pink in that order. Every tile is SMEARED ALONG ONE SHARED DIAGONAL — the ' +
    'streaks run the same direction on all four, slightly off horizontal, rather than radiating outward or ' +
    'differing per tile. Crisp-edged tiles, or smears running different ways, are both failures. The tiles keep ' +
    'their positions and their colours; only their edges are drawn out.',
);
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x05060aff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlDirectionalBlurEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createDirectionalBlurEffect({ angle: 28.65, length: 24, samples: 12 })]);
}

// A few mid-screen shapes spaced along the horizontal axis with gaps between them, so a full-frame
// directional/radial/camera smear leaves clearly readable streaks rather than overlapping mush.

// The tile centres the scene draws AND the centres the oracle probes, so the two cannot drift apart.
const TILE_CENTRES: ReadonlyArray<readonly [number, number]> = [
  [160, 240],
  [320, 312],
  [480, 240],
  [640, 312],
];

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xfff05cff, 0x5cffe0ff, 0xff5ce0ff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -55, -55, 110, 110);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.2 + 0.2 * i);
  shape.y = logicalHeight * (0.4 + 0.12 * (i % 2));
  shape.rotation = 10 + i * 18;
  addNodeChild(root, shape);
}

render(root);

// ★ THIS IS THE CHECK THAT WOULD HAVE CAUGHT THE Gl SIGN DEFECT, and it is written from the two
// pictures rather than from the geometry, which is stated plainly because it changes how to read it.
//
// The Gl runner's smear direction is `vec2(cos(u_angle), -sin(u_angle))`: the negation converts the
// descriptor's screen-space angle (+Y down) into Gl's bottom-left-origin texcoords. Dropping it mirrors
// the streak axis in Y. The scene's own whole-frame `measureHighFrequency` scalar cannot see that — a
// mirrored axis leaves a frame-wide average untouched — which is exactly how the defect survived.
//
// So the probe is a PAIR of boxes placed symmetrically above and below each tile centre, and the
// statistic is their ratio, which is a property of the axis rather than of the overall brightness. The
// offset was found by searching both renders for maximum separation, NOT derived from the tile
// geometry; both numbers are recorded so the choice is reproducible:
//
//     smear direction  vec2(cos, -sin)   upper 44.5   lower 13.6   ratio 3.26   as shipped
//     smear direction  vec2(cos,  sin)   upper 33.1   lower 21.9   ratio 1.51   the defect
//
// The threshold sits between them with about 1.5x of room on each side.
const PROBE_DX = -42;
const PROBE_DY = 60;
const PROBE_RADIUS = 10;
const MIN_AXIS_RATIO = 2.2;

export function assertRender(frame: Readonly<Bitmap>): void {
  const luminance = (x: number, y: number): number => {
    const rgb = getBitmapPixelRgb(frame, x, y);
    return (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
  };
  const meanAt = (dx: number, dy: number): number => {
    let sum = 0;
    let count = 0;
    for (const [cx, cy] of TILE_CENTRES) {
      for (let y = cy + dy - PROBE_RADIUS; y < cy + dy + PROBE_RADIUS; y++) {
        for (let x = cx + dx - PROBE_RADIUS; x < cx + dx + PROBE_RADIUS; x++) {
          if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
          sum += luminance(x, y);
          count++;
        }
      }
    }
    return count === 0 ? 0 : sum / count;
  };

  const upper = meanAt(PROBE_DX, -PROBE_DY);
  const lower = meanAt(PROBE_DX, PROBE_DY);
  const ratio = upper / Math.max(1e-6, lower);
  if (ratio < MIN_AXIS_RATIO) {
    throw new Error(
      `[effect-directional-blur] the smear is ${ratio.toFixed(2)}x brighter above the tiles than below ` +
        `(expected at least ${MIN_AXIS_RATIO}x, measured ${upper.toFixed(1)} against ${lower.toFixed(1)}) ` +
        `— the streak axis is mirrored in Y, which is what dropping the sin negation in the Gl runner does`,
    );
  }
}
