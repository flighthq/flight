import type { DecodedImage, ImageDecoder } from '@flighthq/types';

import {
  clearImageDecoders,
  getImageDecoder,
  hasImageDecoder,
  registerImageDecoder,
  unregisterImageDecoder,
} from './imageDecoderRegistry';

const fakeDecoder: ImageDecoder = async (): Promise<DecodedImage> => ({
  data: new Uint8ClampedArray(4),
  width: 1,
  height: 1,
});

afterEach(() => {
  clearImageDecoders();
});

describe('clearImageDecoders', () => {
  it('removes every registered decoder', () => {
    registerImageDecoder('image/png', fakeDecoder);
    registerImageDecoder('image/jpeg', fakeDecoder);
    clearImageDecoders();
    expect(hasImageDecoder('image/png')).toBe(false);
    expect(hasImageDecoder('image/jpeg')).toBe(false);
  });
});

describe('getImageDecoder', () => {
  it('returns the registered decoder', () => {
    registerImageDecoder('image/png', fakeDecoder);
    expect(getImageDecoder('image/png')).toBe(fakeDecoder);
  });

  it('returns null when no decoder is registered', () => {
    expect(getImageDecoder('image/png')).toBeNull();
  });
});

describe('hasImageDecoder', () => {
  it('reflects registration state', () => {
    expect(hasImageDecoder('image/png')).toBe(false);
    registerImageDecoder('image/png', fakeDecoder);
    expect(hasImageDecoder('image/png')).toBe(true);
  });
});

describe('registerImageDecoder', () => {
  it('is empty until called', () => {
    expect(hasImageDecoder('image/png')).toBe(false);
  });

  it('overwrites an existing decoder (last-write-wins)', () => {
    const other: ImageDecoder = async () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
    registerImageDecoder('image/png', fakeDecoder);
    registerImageDecoder('image/png', other);
    expect(getImageDecoder('image/png')).toBe(other);
  });
});

describe('unregisterImageDecoder', () => {
  it('removes a single decoder', () => {
    registerImageDecoder('image/png', fakeDecoder);
    unregisterImageDecoder('image/png');
    expect(hasImageDecoder('image/png')).toBe(false);
  });
});
