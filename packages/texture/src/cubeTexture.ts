import { createEntity } from '@flighthq/entity';
import type { CubeTexture, CubeTextureLike } from '@flighthq/types';

import { cloneSampler, createSampler } from './sampler';

// Allocates an independent CubeTexture over the SAME six face pixels: each ImageResource reference
// is shared (the faces array itself is a fresh copy, so reassigning a face on the clone does not
// touch the source), while the Sampler is deep-cloned so the cubes sample independently.
export function cloneCubeTexture(source: Readonly<CubeTextureLike>): CubeTexture {
  return createEntity({
    colorSpace: source.colorSpace,
    faces: source.faces.slice(),
    sampler: cloneSampler(source.sampler),
  });
}

// Builds a CubeTexture: six unbound faces (all null, in the canonical +X, -X, +Y, -Y, +Z, -Z
// order), a default Sampler, and 'srgb' color space (the environment-radiance default). Pass
// CubeTextureLike fields to override any of these; a supplied `faces` array is copied.
export function createCubeTexture(opts?: Readonly<Partial<CubeTextureLike>>): CubeTexture {
  return createEntity({
    colorSpace: opts?.colorSpace ?? 'srgb',
    faces: opts?.faces ? opts.faces.slice() : [null, null, null, null, null, null],
    sampler: opts?.sampler ? cloneSampler(opts.sampler) : createSampler(),
  });
}
