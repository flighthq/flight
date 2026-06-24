import { createEntity } from '@flighthq/entity';
import type { CubeTexture, CubeTextureLike, ImageResource } from '@flighthq/types';

import { cloneSampler, copySampler, createSampler, equalsSampler } from './sampler';

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

// Copies every CubeTexture field from source into out in place. Each face reference is shared;
// the Sampler is copied into out's existing Sampler entity (its identity is preserved). Safe when
// out aliases source: all input values are read into locals before any writes.
export function copyCubeTexture(out: CubeTextureLike, source: Readonly<CubeTextureLike>): void {
  const colorSpace = source.colorSpace;
  const f0 = source.faces[0];
  const f1 = source.faces[1];
  const f2 = source.faces[2];
  const f3 = source.faces[3];
  const f4 = source.faces[4];
  const f5 = source.faces[5];
  copySampler(out.sampler, source.sampler);
  out.colorSpace = colorSpace;
  const faces = out.faces as (ImageResource | null)[];
  faces[0] = f0;
  faces[1] = f1;
  faces[2] = f2;
  faces[3] = f3;
  faces[4] = f4;
  faces[5] = f5;
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

// True when both cube textures describe identical state: same color space, same sampler state, and
// the same face references in every slot. Returns false for null/undefined operands.
export function equalsCubeTexture(
  a: Readonly<CubeTextureLike> | null | undefined,
  b: Readonly<CubeTextureLike> | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.colorSpace !== b.colorSpace) return false;
  if (!equalsSampler(a.sampler, b.sampler)) return false;
  for (let i = 0; i < 6; i++) {
    if (a.faces[i] !== b.faces[i]) return false;
  }
  return true;
}

// Returns the pixel size (width = height for a cube face) of the first non-null face, or -1 when
// no face is bound. Cube faces are assumed square; width is used as the canonical face size.
export function getCubeTextureFaceSize(cube: Readonly<CubeTextureLike>): number {
  for (let i = 0; i < 6; i++) {
    const face = cube.faces[i];
    if (face !== null) return face.width;
  }
  return -1;
}

// True when all six faces are non-null. Materials and IBL pipelines (skybox, reflections) gate
// sampling behind this; an incomplete cube is treated as absent.
export function isCubeTextureComplete(cube: Readonly<CubeTextureLike>): boolean {
  return cube.faces.every((face) => face !== null);
}

// Assigns a single face image in place. Use the CubeFace* constants from @flighthq/types
// (CubeFacePositiveX = 0, CubeFaceNegativeX = 1, CubeFacePositiveY = 2, CubeFaceNegativeY = 3,
// CubeFacePositiveZ = 4, CubeFaceNegativeZ = 5) instead of magic-number indices.
// Pass null to unbind the face.
export function setCubeTextureFace(cube: CubeTextureLike, faceIndex: number, image: ImageResource | null): void {
  (cube.faces as (ImageResource | null)[])[faceIndex] = image;
}
