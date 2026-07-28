import type {
  CreateCubeTextureOptions,
  ImageBacking,
  Texture,
  TextureCubeImages,
  TextureLike,
  TextureStorage,
} from '@flighthq/types/contract';

import { cloneSampler } from './sampler';
import { cloneTexture, copyTexture, createTexture, equalsTexture } from './texture';

function getCubeImages(texture: Readonly<TextureLike>): TextureCubeImages {
  if (texture.storage.dimension !== 'cube') throw new Error('cube texture storage required');
  return texture.storage.images;
}

export function cloneCubeTexture(
  source: Readonly<TextureLike>,
): Texture & { storage: Extract<TextureStorage, { dimension: 'cube' }> } {
  getCubeImages(source);
  return cloneTexture(source) as Texture & { storage: Extract<TextureStorage, { dimension: 'cube' }> };
}

export function copyCubeTexture(out: TextureLike, source: Readonly<TextureLike>): void {
  getCubeImages(out);
  getCubeImages(source);
  copyTexture(out, source);
}

export function createCubeTexture(
  opts?: Readonly<CreateCubeTextureOptions>,
): Texture & { storage: Extract<TextureStorage, { dimension: 'cube' }> } {
  return createTexture({
    colorSpace: opts?.colorSpace ?? 'srgb',
    sampler: opts?.sampler ? cloneSampler(opts.sampler) : undefined,
    storage: {
      dimension: 'cube',
      images: opts?.images ?? [null, null, null, null, null, null],
    },
  }) as Texture & { storage: Extract<TextureStorage, { dimension: 'cube' }> };
}

export function equalsCubeTexture(
  a: Readonly<TextureLike> | null | undefined,
  b: Readonly<TextureLike> | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.storage.dimension === 'cube' && b.storage.dimension === 'cube' && equalsTexture(a, b);
}

export function getCubeTextureFaceSize(cube: Readonly<TextureLike>): number {
  const images = getCubeImages(cube);
  for (let i = 0; i < 6; i++) {
    const face = images[i];
    if (face !== null) return face.width;
  }
  return -1;
}

export function isCubeTextureComplete(cube: Readonly<TextureLike>): boolean {
  return getCubeImages(cube).every((face) => face !== null);
}

export function setCubeTextureFace(cube: TextureLike, faceIndex: number, image: ImageBacking | null): void {
  const images = getCubeImages(cube);
  if (images[faceIndex] === image) return;
  (images as unknown as (ImageBacking | null)[])[faceIndex] = image;
  cube.version = (cube.version + 1) >>> 0;
}
