import type { ImageEncoder } from '@flighthq/types';

import {
  clearImageEncoders,
  getImageEncoder,
  hasImageEncoder,
  registerImageEncoder,
  unregisterImageEncoder,
} from './imageEncoderRegistry';

const fakeEncoder: ImageEncoder = async (): Promise<Uint8Array> => new Uint8Array(0);

afterEach(() => {
  clearImageEncoders();
});

describe('clearImageEncoders', () => {
  it('removes every registered encoder', () => {
    registerImageEncoder('image/png', fakeEncoder);
    registerImageEncoder('image/jpeg', fakeEncoder);
    clearImageEncoders();
    expect(hasImageEncoder('image/png')).toBe(false);
    expect(hasImageEncoder('image/jpeg')).toBe(false);
  });
});

describe('getImageEncoder', () => {
  it('returns the registered encoder', () => {
    registerImageEncoder('image/png', fakeEncoder);
    expect(getImageEncoder('image/png')).toBe(fakeEncoder);
  });

  it('returns null when no encoder is registered', () => {
    expect(getImageEncoder('image/png')).toBeNull();
  });
});

describe('hasImageEncoder', () => {
  it('reflects registration state', () => {
    expect(hasImageEncoder('image/png')).toBe(false);
    registerImageEncoder('image/png', fakeEncoder);
    expect(hasImageEncoder('image/png')).toBe(true);
  });
});

describe('registerImageEncoder', () => {
  it('is empty until called', () => {
    expect(hasImageEncoder('image/png')).toBe(false);
  });

  it('overwrites an existing encoder (last-write-wins)', () => {
    const other: ImageEncoder = async () => new Uint8Array(1);
    registerImageEncoder('image/png', fakeEncoder);
    registerImageEncoder('image/png', other);
    expect(getImageEncoder('image/png')).toBe(other);
  });
});

describe('unregisterImageEncoder', () => {
  it('removes a single encoder', () => {
    registerImageEncoder('image/png', fakeEncoder);
    unregisterImageEncoder('image/png');
    expect(hasImageEncoder('image/png')).toBe(false);
  });
});
