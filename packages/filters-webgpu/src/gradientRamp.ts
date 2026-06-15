import type { WebGPURenderStateInternal } from '@flighthq/render-webgpu';
import type { WebGPURenderState } from '@flighthq/types';

/**
 * Builds a 256-entry RGBA gradient ramp texture on the GPU. The caller owns the
 * returned texture and must destroy it with `texture.destroy()` when done.
 *
 * `ratios` are in byte scale [0,255]. Colors are packed RGB integers.
 * `alphas` are in [0,1].
 */
export function createWebGPUGradientRampTexture(
  state: WebGPURenderState,
  colors: ReadonlyArray<number>,
  alphas: ReadonlyArray<number>,
  ratios: ReadonlyArray<number>,
): GPUTexture {
  const data = buildRampData(colors, alphas, ratios);
  const internal = state as WebGPURenderStateInternal;
  const { device } = internal;

  const texture = device.createTexture({
    size: [256, 1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  device.queue.writeTexture(
    { texture, origin: [0, 0, 0] },
    data.buffer as ArrayBuffer,
    { offset: 0, bytesPerRow: 256 * 4 },
    [256, 1, 1],
  );

  return texture;
}

function buildRampData(
  colors: ReadonlyArray<number>,
  alphas: ReadonlyArray<number>,
  ratios: ReadonlyArray<number>,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(256 * 4);
  if (colors.length === 0) return out;

  for (let i = 0; i < 256; i++) {
    const t = i;
    let r = 0,
      g = 0,
      b = 0,
      a = 0;

    if (t <= ratios[0]) {
      const c = colors[0];
      r = (c >> 16) & 0xff;
      g = (c >> 8) & 0xff;
      b = c & 0xff;
      a = Math.round(alphas[0] * 255);
    } else if (t >= ratios[ratios.length - 1]) {
      const c = colors[colors.length - 1];
      r = (c >> 16) & 0xff;
      g = (c >> 8) & 0xff;
      b = c & 0xff;
      a = Math.round(alphas[alphas.length - 1] * 255);
    } else {
      for (let j = 0; j < ratios.length - 1; j++) {
        const r0 = ratios[j];
        const r1 = ratios[j + 1];
        if (t >= r0 && t <= r1) {
          const blend = r1 > r0 ? (t - r0) / (r1 - r0) : 0;
          const c0 = colors[j];
          const c1 = colors[j + 1];
          r = Math.round(((c0 >> 16) & 0xff) * (1 - blend) + ((c1 >> 16) & 0xff) * blend);
          g = Math.round(((c0 >> 8) & 0xff) * (1 - blend) + ((c1 >> 8) & 0xff) * blend);
          b = Math.round((c0 & 0xff) * (1 - blend) + (c1 & 0xff) * blend);
          a = Math.round(alphas[j] * 255 * (1 - blend) + alphas[j + 1] * 255 * blend);
          break;
        }
      }
    }

    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }

  return out;
}
