import type {
  CanvasRenderEffectRunner,
  CanvasRenderState,
  CanvasRenderTarget,
  TiltShiftEffect,
} from '@flighthq/types/contract';

import { drawCanvasImageDataPass } from './canvasEffectCompositing';
import { registerCanvasRenderEffect } from './canvasRenderEffectRegistry';

// Tilt shift (REAL): keep a horizontal focus band sharp and blur above and below it, matching the
// Gl/Wgpu recipe tap for tap — seven uniformly weighted vertical samples spaced `radius` pixels apart,
// where `radius = smoothstep(width/2, width/2 + width, |y - center|) * blur`.
//
// ★ THE TAP COUNT AND WEIGHTING ARE PART OF THE PICTURE, not an implementation detail. A Gaussian of
// the same nominal radius would be a defensible blur and a different image; seven equal taps is what
// the other two backends draw, so it is what agreement means here.
//
// ★ `center` IS MEASURED DOWN FROM THE TOP EDGE (see TiltShiftEffect). Canvas ImageData is already
// top-down, so this runner passes the value straight through where the Gl runner must flip it. That
// asymmetry is the convention working, not a discrepancy — and a centred band hides it completely,
// because |y - 0.5| is symmetric, so only an off-centre band can show it going wrong.
export function applyTiltShiftEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<TiltShiftEffect>,
): void {
  const center = effect.center ?? 0.5;
  const bandWidth = effect.width ?? 0.3;
  const blur = effect.blur ?? 4;

  drawCanvasImageDataPass(dest, source, (data, pixelCount) => {
    const width = source.width;
    const height = Math.max(1, Math.round(pixelCount / Math.max(1, width)));
    // The taps read the ORIGINAL image. Blurring in place would feed each row's own blurred result
    // into the next row's taps, which is a different (and direction-dependent) operator.
    const snapshot = new Uint8ClampedArray(data);
    const edge = bandWidth * 0.5;

    for (let y = 0; y < height; y++) {
      const distance = Math.abs((y + 0.5) / height - center);
      const ramp = Math.max(0, Math.min(1, (distance - edge) / Math.max(1e-6, bandWidth)));
      const radius = ramp * ramp * (3 - 2 * ramp) * blur;

      for (let x = 0; x < width; x++) {
        const out = (y * width + x) * 4;
        let red = 0;
        let green = 0;
        let blue = 0;
        let alpha = 0;

        for (let tap = -TAP_REACH; tap <= TAP_REACH; tap++) {
          // The GPU offsets by `tap * radius * texel`, which lands on a fractional row; its linear
          // sampler then interpolates. Rounding to the nearest row instead would quantise the ramp
          // into visible bands wherever radius passes a half-pixel.
          const sampleY = y + tap * radius;
          const low = Math.max(0, Math.min(height - 1, Math.floor(sampleY)));
          const high = Math.max(0, Math.min(height - 1, low + 1));
          const blend = Math.max(0, Math.min(1, sampleY - Math.floor(sampleY)));
          const lowAt = (low * width + x) * 4;
          const highAt = (high * width + x) * 4;

          red += snapshot[lowAt]! * (1 - blend) + snapshot[highAt]! * blend;
          green += snapshot[lowAt + 1]! * (1 - blend) + snapshot[highAt + 1]! * blend;
          blue += snapshot[lowAt + 2]! * (1 - blend) + snapshot[highAt + 2]! * blend;
          alpha += snapshot[lowAt + 3]! * (1 - blend) + snapshot[highAt + 3]! * blend;
        }

        data[out] = Math.round(red / TAP_COUNT);
        data[out + 1] = Math.round(green / TAP_COUNT);
        data[out + 2] = Math.round(blue / TAP_COUNT);
        data[out + 3] = Math.round(alpha / TAP_COUNT);
      }
    }
  });
}

export const defaultCanvasTiltShiftEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyTiltShiftEffectToCanvas(ctx.source, ctx.dest, effect as TiltShiftEffect);
};

export function registerCanvasTiltShiftEffect(state: CanvasRenderState): void {
  registerCanvasRenderEffect(state, 'TiltShiftEffect', defaultCanvasTiltShiftEffectRunner);
}

const TAP_REACH = 3;
const TAP_COUNT = TAP_REACH * 2 + 1;
