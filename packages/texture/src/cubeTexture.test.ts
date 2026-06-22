import type { ImageResource } from '@flighthq/types';

import { cloneCubeTexture, createCubeTexture } from './cubeTexture';
import { createSampler, equalsSampler } from './sampler';

const fakeFace = { width: 2, height: 2 } as ImageResource;

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
