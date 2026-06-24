import { createEntity } from '@flighthq/entity';
import type { Sampler, SamplerLike } from '@flighthq/types';

// Allocates an independent Sampler with the same sampling state. Sampler holds only plain values,
// so the clone shares nothing mutable with its source.
export function cloneSampler(source: Readonly<SamplerLike>): Sampler {
  return createEntity({
    anisotropy: source.anisotropy,
    magFilter: source.magFilter,
    minFilter: source.minFilter,
    mipmaps: source.mipmaps,
    wrapU: source.wrapU,
    wrapV: source.wrapV,
  });
}

// Copies every sampling field from source into out in place. Safe when out aliases source: all
// reads precede the writes implicitly because each field is read and written independently.
export function copySampler(out: SamplerLike, source: Readonly<SamplerLike>): void {
  out.anisotropy = source.anisotropy;
  out.magFilter = source.magFilter;
  out.minFilter = source.minFilter;
  out.mipmaps = source.mipmaps;
  out.wrapU = source.wrapU;
  out.wrapV = source.wrapV;
}

// Anisotropic sampler for high-quality surface textures rendered at oblique angles. Uses the given
// anisotropy level (typically 4 or 16 — capped to hardware maximum by the backend), with
// trilinear filtering and clamp-to-edge. Pass level 1 to disable anisotropy.
export function createAnisotropicSampler(level: number): Sampler {
  return createSampler({ anisotropy: level });
}

// Clamp-to-edge linear sampler — the default preset, named for explicit use in builder code and
// materials that want to signal their intent clearly. Clamp/linear/trilinear/mipmaps on.
export function createClampLinearSampler(): Sampler {
  return createSampler();
}

// Pixel-art sampler: nearest-neighbor filtering, clamp-to-edge, mipmaps disabled. Produces crisp,
// unsmoothed pixels for retro / pixel-art rendering styles.
export function createPixelArtSampler(): Sampler {
  return createSampler({ magFilter: 'nearest', minFilter: 'nearest', mipmaps: false });
}

// Builds a Sampler with the AAA-default sampling state: clamp-to-edge on both axes, linear
// magnification, trilinear minification, a generated mip chain, and anisotropy disabled (1). Pass
// SamplerLike fields to override any of these.
export function createSampler(opts?: Readonly<Partial<SamplerLike>>): Sampler {
  return createEntity({
    anisotropy: opts?.anisotropy ?? 1,
    magFilter: opts?.magFilter ?? 'linear',
    minFilter: opts?.minFilter ?? 'linear-mipmap-linear',
    mipmaps: opts?.mipmaps ?? true,
    wrapU: opts?.wrapU ?? 'clamp-to-edge',
    wrapV: opts?.wrapV ?? 'clamp-to-edge',
  });
}

// Tiling sampler: repeat wrap on both axes, trilinear filtering, mipmaps on. Suitable for
// seamless tiling surface textures (terrain, ground planes, repeating patterns).
export function createTilingSampler(): Sampler {
  return createSampler({ wrapU: 'repeat', wrapV: 'repeat' });
}

// True when both samplers describe identical sampling state. Returns false for null/undefined
// operands so callers can compare nullable references directly.
export function equalsSampler(
  a: Readonly<SamplerLike> | null | undefined,
  b: Readonly<SamplerLike> | null | undefined,
): boolean {
  if (!a || !b) return false;
  return (
    a === b ||
    (a.anisotropy === b.anisotropy &&
      a.magFilter === b.magFilter &&
      a.minFilter === b.minFilter &&
      a.mipmaps === b.mipmaps &&
      a.wrapU === b.wrapU &&
      a.wrapV === b.wrapV)
  );
}
