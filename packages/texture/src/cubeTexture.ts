import type { CreateCubeTextureOptions, CubeTexture, TextureSource, TextureCubeImages } from '@flighthq/types/contract';

import { cloneSampler } from './sampler';
import { cloneTexture, copyTexture, createTexture, equalsTexture } from './texture';

function getCubeImages(texture: Readonly<CubeTexture>): TextureCubeImages {
  return texture.storage.images;
}

export function cloneCubeTexture(source: Readonly<CubeTexture>): CubeTexture {
  return cloneTexture(source) as CubeTexture;
}

export function copyCubeTexture(out: CubeTexture, source: Readonly<CubeTexture>): void {
  copyTexture(out, source);
}

export function createCubeTexture(opts?: Readonly<CreateCubeTextureOptions>): CubeTexture {
  return createTexture({
    colorSpace: opts?.colorSpace ?? 'srgb',
    sampler: opts?.sampler ? cloneSampler(opts.sampler) : undefined,
    storage: {
      dimension: 'cube',
      images: opts?.images ?? [null, null, null, null, null, null],
    },
  }) as CubeTexture;
}

export function equalsCubeTexture(
  a: Readonly<CubeTexture> | null | undefined,
  b: Readonly<CubeTexture> | null | undefined,
): boolean {
  if (!a || !b) return false;
  return equalsTexture(a, b);
}

export function getCubeTextureFaceSize(cube: Readonly<CubeTexture>): number {
  const images = getCubeImages(cube);
  for (let i = 0; i < 6; i++) {
    const face = images[i];
    if (face !== null) return face.width;
  }
  return -1;
}

export function isCubeTextureComplete(cube: Readonly<CubeTexture>): boolean {
  return getCubeImages(cube).every((face) => face !== null);
}

export function setCubeTextureFace(cube: CubeTexture, faceIndex: number, image: TextureSource | null): void {
  const images = getCubeImages(cube);
  if (images[faceIndex] === image) return;
  (images as unknown as (TextureSource | null)[])[faceIndex] = image;
  cube.version = (cube.version + 1) >>> 0;
}
