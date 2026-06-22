import type { ImageResource } from '@flighthq/types';

import { createSampler, equalsSampler } from './sampler';
import { cloneTexture, copyTexture, createTexture, isTextureReady, setTextureImage } from './texture';

const fakeImage = { width: 2, height: 2 } as ImageResource;

describe('cloneTexture', () => {
  it('shares the image but deep-clones the sampler and uv vectors', () => {
    const source = createTexture({
      colorSpace: 'linear',
      image: fakeImage,
      uvRotation: 0.5,
    });
    source.uvOffset.x = 0.25;
    source.uvScale.y = 3;

    const copy = cloneTexture(source);

    expect(copy).not.toBe(source);
    expect(copy.image).toBe(fakeImage);
    expect(copy.colorSpace).toStrictEqual('linear');
    expect(copy.uvRotation).toStrictEqual(0.5);
    expect(copy.sampler).not.toBe(source.sampler);
    expect(equalsSampler(copy.sampler, source.sampler)).toBe(true);
    expect(copy.uvOffset).not.toBe(source.uvOffset);
    expect(copy.uvOffset.x).toStrictEqual(0.25);
    expect(copy.uvScale.y).toStrictEqual(3);

    copy.uvOffset.x = 0.9;
    expect(source.uvOffset.x).toStrictEqual(0.25);
  });
});

describe('copyTexture', () => {
  it('writes every field from source into a distinct out, preserving out entity identities', () => {
    const source = createTexture({ colorSpace: 'linear', image: fakeImage, uvRotation: 1 });
    source.uvScale.x = 4;
    const out = createTexture();
    const outSampler = out.sampler;
    const outOffset = out.uvOffset;

    copyTexture(out, source);

    expect(out.image).toBe(fakeImage);
    expect(out.colorSpace).toStrictEqual('linear');
    expect(out.uvRotation).toStrictEqual(1);
    expect(out.uvScale.x).toStrictEqual(4);
    expect(out.sampler).toBe(outSampler);
    expect(out.uvOffset).toBe(outOffset);
  });

  it('is safe when out aliases source', () => {
    const source = createTexture({ colorSpace: 'linear', image: fakeImage, uvRotation: 2 });
    source.uvScale.x = 7;

    copyTexture(source, source);

    expect(source.colorSpace).toStrictEqual('linear');
    expect(source.image).toBe(fakeImage);
    expect(source.uvRotation).toStrictEqual(2);
    expect(source.uvScale.x).toStrictEqual(7);
  });
});

describe('createTexture', () => {
  it('applies the default unbound, srgb, identity-transform state', () => {
    const texture = createTexture();

    expect(texture.image).toBeNull();
    expect(texture.colorSpace).toStrictEqual('srgb');
    expect(texture.uvRotation).toStrictEqual(0);
    expect(texture.uvOffset.x).toStrictEqual(0);
    expect(texture.uvOffset.y).toStrictEqual(0);
    expect(texture.uvScale.x).toStrictEqual(1);
    expect(texture.uvScale.y).toStrictEqual(1);
    expect(equalsSampler(texture.sampler, createSampler())).toBe(true);
  });

  it('clones supplied sampler and uv vectors rather than aliasing them', () => {
    const sampler = createSampler({ anisotropy: 8 });
    const texture = createTexture({ sampler });

    expect(texture.sampler).not.toBe(sampler);
    expect(texture.sampler.anisotropy).toStrictEqual(8);
  });
});

describe('isTextureReady', () => {
  it('is false with a null image and true once bound', () => {
    const texture = createTexture();

    expect(isTextureReady(texture)).toBe(false);

    texture.image = fakeImage;
    expect(isTextureReady(texture)).toBe(true);
  });
});

describe('setTextureImage', () => {
  it('binds and clears the image in place', () => {
    const texture = createTexture();

    setTextureImage(texture, fakeImage);
    expect(texture.image).toBe(fakeImage);

    setTextureImage(texture, null);
    expect(texture.image).toBeNull();
  });
});
