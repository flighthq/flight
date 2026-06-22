import { cloneSampler, copySampler, createSampler, equalsSampler } from './sampler';

describe('cloneSampler', () => {
  it('copies every field into an independent entity', () => {
    const source = createSampler({
      anisotropy: 8,
      magFilter: 'nearest',
      minFilter: 'nearest-mipmap-nearest',
      mipmaps: false,
      wrapU: 'repeat',
      wrapV: 'mirror-repeat',
    });

    const copy = cloneSampler(source);

    expect(copy).not.toBe(source);
    expect(equalsSampler(copy, source)).toBe(true);

    copy.anisotropy = 2;
    expect(source.anisotropy).toStrictEqual(8);
  });
});

describe('copySampler', () => {
  it('writes every field from source into a distinct out', () => {
    const source = createSampler({ anisotropy: 4, mipmaps: false, wrapU: 'repeat' });
    const out = createSampler();

    copySampler(out, source);

    expect(out).not.toBe(source);
    expect(equalsSampler(out, source)).toBe(true);
  });

  it('is safe when out aliases source', () => {
    const source = createSampler({ anisotropy: 4, wrapV: 'mirror-repeat' });

    copySampler(source, source);

    expect(source.anisotropy).toStrictEqual(4);
    expect(source.wrapV).toStrictEqual('mirror-repeat');
  });
});

describe('createSampler', () => {
  it('applies the default sampling state', () => {
    const sampler = createSampler();

    expect(sampler.anisotropy).toStrictEqual(1);
    expect(sampler.magFilter).toStrictEqual('linear');
    expect(sampler.minFilter).toStrictEqual('linear-mipmap-linear');
    expect(sampler.mipmaps).toBe(true);
    expect(sampler.wrapU).toStrictEqual('clamp-to-edge');
    expect(sampler.wrapV).toStrictEqual('clamp-to-edge');
  });

  it('overrides only the supplied fields', () => {
    const sampler = createSampler({ anisotropy: 16, wrapU: 'repeat' });

    expect(sampler.anisotropy).toStrictEqual(16);
    expect(sampler.wrapU).toStrictEqual('repeat');
    expect(sampler.wrapV).toStrictEqual('clamp-to-edge');
    expect(sampler.mipmaps).toBe(true);
  });
});

describe('equalsSampler', () => {
  it('is true for identical state and the same reference', () => {
    const a = createSampler({ anisotropy: 4 });
    const b = createSampler({ anisotropy: 4 });

    expect(equalsSampler(a, b)).toBe(true);
    expect(equalsSampler(a, a)).toBe(true);
  });

  it('is false when any field differs', () => {
    const a = createSampler();
    const b = createSampler({ mipmaps: false });

    expect(equalsSampler(a, b)).toBe(false);
  });

  it('is false for null or undefined operands', () => {
    const a = createSampler();

    expect(equalsSampler(a, null)).toBe(false);
    expect(equalsSampler(null, a)).toBe(false);
    expect(equalsSampler(undefined, undefined)).toBe(false);
  });
});
