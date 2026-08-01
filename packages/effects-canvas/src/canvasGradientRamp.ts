import type { CanvasRenderTarget } from '@flighthq/types/contract';

import { drawCanvasImageDataPass } from './canvasEffectCompositing';

// The 256-entry colour ramp the gradient effects index, and the pass that indexes it.
//
// This is a per-pixel LOOKUP, not a spatial gradient, and the distinction is the whole reason this file
// uses `drawCanvasImageDataPass` rather than `createLinearGradient`. The GL passes read
// `texture(u_ramp, vec2(value, 0.5))` — the ramp is indexed by a per-pixel SCALAR (a blurred alpha for
// the glow, an encoded bevel depth for the bevel), so where a colour lands depends on the value at that
// pixel and not on where the pixel is. A CSS gradient paints by position and cannot express that for an
// arbitrary silhouette.
//
// The per-pixel cost is one table read per pixel with no resampling, which is a different and much
// cheaper class than the radial remaps that are still unimplemented on this backend.

// Replaces every pixel of `source` with the ramp entry its ALPHA indexes, writing to `dest`. `bias` and
// `scale` map that alpha into the ramp before the lookup: the glow passes 0 and 1 to index directly,
// while the bevel passes 0.5 and ±0.5 so a band's strength runs outward from the ramp's midpoint, which
// is how the shadow half and the highlight half read opposite ends of one ramp.
//
// Output alpha is the ramp's own, matching GL, where the lookup result is written unmultiplied by the
// source. A ramp whose first entry is transparent therefore leaves the untouched exterior transparent.
export function applyCanvasGradientRampLookup(
  dest: Readonly<CanvasRenderTarget>,
  source: Readonly<CanvasRenderTarget>,
  ramp: Readonly<Uint8ClampedArray>,
  bias = 0,
  scale = 1,
): void {
  drawCanvasImageDataPass(dest, source, (data, pixelCount) => {
    for (let i = 0; i < pixelCount; i++) {
      const at = i * 4;
      const t = bias + (data[at + 3] / 255) * scale;
      const index = Math.max(0, Math.min(255, Math.round(t * 255))) * 4;
      data[at] = ramp[index];
      data[at + 1] = ramp[index + 1];
      data[at + 2] = ramp[index + 2];
      data[at + 3] = ramp[index + 3];
    }
  });
}

// Builds the ramp as 256 RGBA entries, mirroring the GL ramp texture: stops are placed by `ratios`
// (0..255) and linearly interpolated between, with the first and last stop extended to the ends.
export function buildCanvasGradientRamp(
  colors: ReadonlyArray<number>,
  alphas: ReadonlyArray<number>,
  ratios: ReadonlyArray<number>,
): Uint8ClampedArray {
  const ramp = new Uint8ClampedArray(256 * 4);
  if (colors.length === 0) return ramp;

  for (let i = 0; i < 256; i++) {
    let upper = 0;
    while (upper < ratios.length && (ratios[upper] ?? 0) < i) upper++;

    let color: number;
    let alpha: number;
    if (upper <= 0) {
      color = colors[0];
      alpha = alphas[0] ?? 1;
    } else if (upper >= colors.length) {
      color = colors[colors.length - 1];
      alpha = alphas[colors.length - 1] ?? 1;
    } else {
      const lowRatio = ratios[upper - 1] ?? 0;
      const highRatio = ratios[upper] ?? 255;
      const span = highRatio - lowRatio;
      // A zero-width span means two stops share a ratio: take the later one rather than dividing by zero.
      const t = span > 0 ? (i - lowRatio) / span : 1;
      const lowColor = colors[upper - 1];
      const highColor = colors[upper];
      color =
        (Math.round(((lowColor >> 16) & 0xff) + (((highColor >> 16) & 0xff) - ((lowColor >> 16) & 0xff)) * t) << 16) |
        (Math.round(((lowColor >> 8) & 0xff) + (((highColor >> 8) & 0xff) - ((lowColor >> 8) & 0xff)) * t) << 8) |
        Math.round((lowColor & 0xff) + ((highColor & 0xff) - (lowColor & 0xff)) * t);
      alpha = (alphas[upper - 1] ?? 1) + ((alphas[upper] ?? 1) - (alphas[upper - 1] ?? 1)) * t;
    }

    const at = i * 4;
    ramp[at] = (color >> 16) & 0xff;
    ramp[at + 1] = (color >> 8) & 0xff;
    ramp[at + 2] = color & 0xff;
    ramp[at + 3] = Math.max(0, Math.min(1, alpha)) * 255;
  }
  return ramp;
}
