import { describe, expect, it } from 'vitest';

import {
  getTextureSampleColorSpace,
  shouldDecodeTextureOnSample,
  shouldPremultiplyTextureOnUpload,
} from './textureColorSpace';

describe('getTextureSampleColorSpace', () => {
  it('selects the decoding format only for sRGB content in a linear working space', () => {
    expect(getTextureSampleColorSpace('srgb', 'linear')).toBe('srgb');
    expect(getTextureSampleColorSpace('srgb', 'srgb')).toBe('linear');
    expect(getTextureSampleColorSpace('linear', 'linear')).toBe('linear');
    expect(getTextureSampleColorSpace('linear', 'srgb')).toBe('linear');
  });
});

describe('shouldDecodeTextureOnSample', () => {
  it('decodes only sRGB content read into a linear working space', () => {
    expect(shouldDecodeTextureOnSample('srgb', 'linear')).toBe(true);
    expect(shouldDecodeTextureOnSample('srgb', 'srgb')).toBe(false);
    expect(shouldDecodeTextureOnSample('linear', 'linear')).toBe(false);
  });

  // Linear content sampled by an sRGB-space path would need an encode-on-sample no GPU offers; it stays
  // byte-through rather than silently pretending otherwise.
  it('leaves linear content byte-through in an sRGB working space', () => {
    expect(shouldDecodeTextureOnSample('linear', 'srgb')).toBe(false);
  });
});

describe('shouldPremultiplyTextureOnUpload', () => {
  // An upload multiply runs on stored bytes, before any decode — valid only when nothing decodes after.
  it('is the exact inverse of decoding on sample', () => {
    for (const source of ['srgb', 'linear'] as const) {
      for (const working of ['srgb', 'linear'] as const) {
        expect(shouldPremultiplyTextureOnUpload(source, working)).toBe(!shouldDecodeTextureOnSample(source, working));
      }
    }
  });

  it('keeps the upload multiply for the byte-through 2D default', () => {
    expect(shouldPremultiplyTextureOnUpload('srgb', 'srgb')).toBe(true);
    expect(shouldPremultiplyTextureOnUpload('srgb', 'linear')).toBe(false);
  });
});
