import type { WgpuRenderState } from '@flighthq/types';

/**
 * Returns a cached 256-entry RGBA gradient ramp texture for the given stops,
 * building it on first use and reusing it on later calls with the same stops.
 * The texture is owned by the render state and lives for its lifetime — callers
 * must NOT destroy it. This is the form recipes should use: a recipe runs inside
 * the frame's command encoder and does not control submit timing, so it cannot
 * safely `destroy()` a per-call texture (the encoder still references it at
 * submit, which discards the whole frame). Caching also avoids a per-frame
 * allocation. Distinct stop sets get distinct textures, so multiple gradient
 * recipes in one frame never alias each other's ramp.
 *
 * `ratios` are in byte scale [0,255]. Colors are packed RGB integers.
 * `alphas` are in [0,1].
 */
export function getWgpuEffectGradientRampTexture(
  state: WgpuRenderState,
  colors: ReadonlyArray<number>,
  alphas: ReadonlyArray<number>,
  ratios: ReadonlyArray<number>,
): GPUTexture {
  let cache = rampCaches.get(state);
  if (cache === undefined) {
    cache = new Map();
    rampCaches.set(state, cache);
  }
  const key = `${colors.join(',')}|${alphas.join(',')}|${ratios.join(',')}`;
  let texture = cache.get(key);
  if (texture === undefined) {
    texture = createWgpuEffectGradientRampTexture(state, colors, alphas, ratios);
    cache.set(key, texture);
  }
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

// Builds a 256-entry RGBA gradient ramp texture on the GPU. The returned texture is cached and owned by
// the render state (see getWgpuEffectGradientRampTexture), so it is never destroyed mid-encoder.
function createWgpuEffectGradientRampTexture(
  state: WgpuRenderState,
  colors: ReadonlyArray<number>,
  alphas: ReadonlyArray<number>,
  ratios: ReadonlyArray<number>,
): GPUTexture {
  const data = buildRampData(colors, alphas, ratios);
  const { device } = state;

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

// Per-render-state cache of ramp textures keyed by their stops. Textures live for the render state's
// lifetime; they are tiny (256×1) and the distinct-gradient set is bounded in practice.
const rampCaches = new WeakMap<WgpuRenderState, Map<string, GPUTexture>>();
