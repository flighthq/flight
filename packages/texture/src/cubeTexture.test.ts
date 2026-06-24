import type { ImageResource } from '@flighthq/types';
import { CubeFaceNegativeX, CubeFacePositiveX, CubeFacePositiveY } from '@flighthq/types';

import {
  cloneCubeTexture,
  copyCubeTexture,
  createCubeTexture,
  equalsCubeTexture,
  getCubeTextureFaceSize,
  isCubeTextureComplete,
  setCubeTextureFace,
} from './cubeTexture';
import { createSampler, equalsSampler } from './sampler';

const fakeFace = { width: 64, height: 64 } as ImageResource;
const fakeFace2 = { width: 128, height: 128 } as ImageResource;

const allFaces: readonly (ImageResource | null)[] = [fakeFace, fakeFace, fakeFace, fakeFace, fakeFace, fakeFace];

describe('cloneCubeTexture', () => {
  it('shares the face references in a fresh array and deep-clones the sampler', () => {
    const source = createCubeTexture({
      colorSpace: 'linear',
      faces: [fakeFace, null, null, null, null, null],
    });

    const copy = cloneCubeTexture(source);

    expect(copy).not.toBe(source);
    expect(copy.colorSpace).toStrictEqual('linear');
    expect(copy.faces).not.toBe(source.faces);
    expect(copy.faces[0]).toBe(fakeFace);
    expect(copy.sampler).not.toBe(source.sampler);
    expect(equalsSampler(copy.sampler, source.sampler)).toBe(true);

    // A fresh faces array means reassigning a face on the clone cannot reach the source.
    expect(copy.faces).not.toBe(source.faces);
    expect(source.faces[1]).toBeNull();
  });
});

describe('copyCubeTexture', () => {
  it('writes every field from source into a distinct out, preserving sampler identity', () => {
    const source = createCubeTexture({
      colorSpace: 'linear',
      faces: [fakeFace, null, null, null, null, null],
    });
    const out = createCubeTexture();
    const outSampler = out.sampler;

    copyCubeTexture(out, source);

    expect(out.colorSpace).toStrictEqual('linear');
    expect(out.faces[0]).toBe(fakeFace);
    expect(out.sampler).toBe(outSampler);
    expect(equalsSampler(out.sampler, source.sampler)).toBe(true);
  });

  it('is safe when out aliases source', () => {
    const cube = createCubeTexture({
      colorSpace: 'linear',
      faces: [fakeFace, null, null, null, null, null],
    });

    copyCubeTexture(cube, cube);

    expect(cube.colorSpace).toStrictEqual('linear');
    expect(cube.faces[0]).toBe(fakeFace);
  });
});

describe('createCubeTexture', () => {
  it('applies the default six unbound faces, srgb, default sampler', () => {
    const cube = createCubeTexture();

    expect(cube.faces).toHaveLength(6);
    expect(cube.faces.every((face) => face === null)).toBe(true);
    expect(cube.colorSpace).toStrictEqual('srgb');
    expect(equalsSampler(cube.sampler, createSampler())).toBe(true);
  });

  it('copies a supplied faces array rather than aliasing it', () => {
    const faces = [fakeFace, null, null, null, null, null];
    const cube = createCubeTexture({ faces });

    expect(cube.faces).not.toBe(faces);
    expect(cube.faces[0]).toBe(fakeFace);
  });
});

describe('equalsCubeTexture', () => {
  it('is true for cubes with the same color space, sampler, and face references', () => {
    const a = createCubeTexture({ colorSpace: 'linear', faces: allFaces });
    const b = createCubeTexture({ colorSpace: 'linear', faces: allFaces });

    expect(equalsCubeTexture(a, b)).toBe(true);
    expect(equalsCubeTexture(a, a)).toBe(true);
  });

  it('is false when colorSpace differs', () => {
    const a = createCubeTexture({ colorSpace: 'linear' });
    const b = createCubeTexture({ colorSpace: 'srgb' });

    expect(equalsCubeTexture(a, b)).toBe(false);
  });

  it('is false when a face reference differs', () => {
    const a = createCubeTexture({ faces: allFaces });
    const b = createCubeTexture({ faces: allFaces });
    (b.faces as (ImageResource | null)[])[0] = fakeFace2;

    expect(equalsCubeTexture(a, b)).toBe(false);
  });

  it('is false when the sampler differs', () => {
    const a = createCubeTexture();
    const b = createCubeTexture({ sampler: createSampler({ mipmaps: false }) });

    expect(equalsCubeTexture(a, b)).toBe(false);
  });

  it('is false for null or undefined operands', () => {
    const a = createCubeTexture();

    expect(equalsCubeTexture(a, null)).toBe(false);
    expect(equalsCubeTexture(null, a)).toBe(false);
    expect(equalsCubeTexture(undefined, undefined)).toBe(false);
  });
});

describe('getCubeTextureFaceSize', () => {
  it('returns the width of the first non-null face', () => {
    const cube = createCubeTexture({ faces: [null, fakeFace, null, null, null, null] });

    expect(getCubeTextureFaceSize(cube)).toStrictEqual(64);
  });

  it('returns -1 when all faces are null', () => {
    const cube = createCubeTexture();

    expect(getCubeTextureFaceSize(cube)).toStrictEqual(-1);
  });
});

describe('isCubeTextureComplete', () => {
  it('is false when any face is null', () => {
    const cube = createCubeTexture({ faces: [fakeFace, null, null, null, null, null] });

    expect(isCubeTextureComplete(cube)).toBe(false);
  });

  it('is true when all six faces are bound', () => {
    const cube = createCubeTexture({ faces: allFaces });

    expect(isCubeTextureComplete(cube)).toBe(true);
  });
});

describe('setCubeTextureFace', () => {
  it('binds a face using a named face constant', () => {
    const cube = createCubeTexture();

    setCubeTextureFace(cube, CubeFacePositiveX, fakeFace);
    expect(cube.faces[CubeFacePositiveX]).toBe(fakeFace);
    expect(cube.faces[CubeFaceNegativeX]).toBeNull();
  });

  it('unbinds a face when passed null', () => {
    const cube = createCubeTexture({ faces: allFaces });

    setCubeTextureFace(cube, CubeFacePositiveY, null);
    expect(cube.faces[CubeFacePositiveY]).toBeNull();
  });
});
