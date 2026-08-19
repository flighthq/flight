import type {
  CanvasRenderEffectRunner,
  CanvasRenderState,
  CanvasRenderTarget,
  LensDistortionEffect,
} from '@flighthq/types/contract';

import { drawCanvasImageDataPass } from './canvasEffectCompositing';
import { registerCanvasRenderEffect } from './canvasRenderEffectRegistry';

// Lens distortion (REAL): remap uv by the same radial polynomial the Gl/Wgpu recipe uses —
// `centered = (uv - 0.5) / scale; distorted = centered * (1 + amount * dot(centered, centered)) + 0.5` —
// sampling the source at the distorted coordinate and writing opaque black where it leaves the frame.
//
// ★ THIS IS A RESAMPLE, NOT A COLOUR OP, which is why it needs the ImageData pass rather than a CSS
// filter chain. It reads the whole source once into a snapshot and writes a fresh buffer, because the
// destination pixel at (x, y) reads a SOURCE pixel somewhere else entirely: transforming in place would
// feed already-distorted pixels back into later samples.
//
// ★ SAMPLING IS BILINEAR, MATCHING THE GPU'S `linear` filter. Nearest-neighbour would land within a
// pixel of the right answer everywhere and still look wrong along every edge in the picture, which is
// the difference between "the parameter is observable" and "the backends agree".
export function applyLensDistortionEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<LensDistortionEffect>,
): void {
  const amount = effect.amount ?? 0.2;
  const scale = effect.scale ?? 1;

  drawCanvasImageDataPass(dest, source, (data, pixelCount) => {
    const width = source.width;
    const height = Math.max(1, Math.round(pixelCount / Math.max(1, width)));
    const snapshot = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const out = (y * width + x) * 4;
        // Pixel CENTRES, matching how the GPU rasterizer hands v_texCoord to the fragment shader; using
        // x/width instead would sample half a texel off across the whole frame.
        const centeredX = ((x + 0.5) / width - 0.5) / scale;
        const centeredY = ((y + 0.5) / height - 0.5) / scale;
        const radiusSquared = centeredX * centeredX + centeredY * centeredY;
        const factor = 1 + amount * radiusSquared;
        const u = centeredX * factor + 0.5;
        const v = centeredY * factor + 0.5;

        if (u < 0 || u > 1 || v < 0 || v > 1) {
          data[out] = 0;
          data[out + 1] = 0;
          data[out + 2] = 0;
          data[out + 3] = 255;
          continue;
        }

        const sampleX = u * width - 0.5;
        const sampleY = v * height - 0.5;
        const x0 = Math.floor(sampleX);
        const y0 = Math.floor(sampleY);
        const fx = sampleX - x0;
        const fy = sampleY - y0;
        const x1 = Math.min(width - 1, Math.max(0, x0 + 1));
        const y1 = Math.min(height - 1, Math.max(0, y0 + 1));
        const cx0 = Math.min(width - 1, Math.max(0, x0));
        const cy0 = Math.min(height - 1, Math.max(0, y0));

        const topLeft = (cy0 * width + cx0) * 4;
        const topRight = (cy0 * width + x1) * 4;
        const bottomLeft = (y1 * width + cx0) * 4;
        const bottomRight = (y1 * width + x1) * 4;

        for (let channel = 0; channel < 4; channel++) {
          const top = snapshot[topLeft + channel]! * (1 - fx) + snapshot[topRight + channel]! * fx;
          const bottom = snapshot[bottomLeft + channel]! * (1 - fx) + snapshot[bottomRight + channel]! * fx;
          data[out + channel] = Math.round(top * (1 - fy) + bottom * fy);
        }
      }
    }
  });
}

export const defaultCanvasLensDistortionEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyLensDistortionEffectToCanvas(ctx.source, ctx.dest, effect as LensDistortionEffect);
};

export function registerCanvasLensDistortionEffect(state: CanvasRenderState): void {
  registerCanvasRenderEffect(state, 'LensDistortionEffect', defaultCanvasLensDistortionEffectRunner);
}
