import type {
  CreateCubeTextureOptions,
  CubeTexture,
  TextureSource,
  TextureSourceCubeFaces,
} from '@flighthq/types/contract';

import { cloneSampler } from './sampler';
import { cloneTexture, copyTexture, createTexture, equalsTexture } from './texture';

function getCubeSources(texture: Readonly<CubeTexture>): TextureSourceCubeFaces {
  return texture.sources;
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
    dimension: 'cube',
    sources: opts?.sources ?? [null, null, null, null, null, null],
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
  const sources = getCubeSources(cube);
  for (let i = 0; i < 6; i++) {
    const face = sources[i];
    if (face !== null) return face.width;
  }
  return -1;
}

export function isCubeTextureComplete(cube: Readonly<CubeTexture>): boolean {
  return getCubeSources(cube).every((face) => face !== null);
}

export function setCubeTextureFace(cube: CubeTexture, faceIndex: number, source: TextureSource | null): void {
  const sources = getCubeSources(cube);
  if (sources[faceIndex] === source) return;
  (sources as unknown as (TextureSource | null)[])[faceIndex] = source;
  cube.version = (cube.version + 1) >>> 0;
}
