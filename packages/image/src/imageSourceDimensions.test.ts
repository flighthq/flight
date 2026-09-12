import type { HostImageSource } from '@flighthq/types/contract';

import {
  getHostImageSourceDimensions,
  hasHostImageDimensionResolver,
  registerHostImageDimensionResolver,
  unregisterHostImageDimensionResolver,
} from './imageSourceDimensions';

// The slot is module state, so every test starts from an empty one rather than from whatever the
// previous test installed.
afterEach(() => {
  unregisterHostImageDimensionResolver();
});

const sizedSource = { height: 4, width: 8 } as unknown as HostImageSource;

describe('getHostImageSourceDimensions', () => {
  it('measures through the registered resolver', () => {
    registerHostImageDimensionResolver((source, out) => {
      const sized = source as unknown as { height: number; width: number };
      out.height = sized.height;
      out.width = sized.width;
      return true;
    });
    const out = { height: 0, width: 0 };

    expect(getHostImageSourceDimensions(sizedSource, out)).toBe(true);
    expect(out).toStrictEqual({ height: 4, width: 8 });
  });

  // Reporting false rather than zero is the whole contract: a caller that already measured its source
  // keeps that size instead of having it overwritten with a number no host produced.
  it('reports false and leaves out untouched with no resolver registered', () => {
    const out = { height: 11, width: 22 };

    expect(getHostImageSourceDimensions(sizedSource, out)).toBe(false);
    expect(out).toStrictEqual({ height: 11, width: 22 });
  });

  it('reports false when the registered resolver declines the handle', () => {
    registerHostImageDimensionResolver(() => false);
    const out = { height: 11, width: 22 };

    expect(getHostImageSourceDimensions(sizedSource, out)).toBe(false);
    expect(out).toStrictEqual({ height: 11, width: 22 });
  });
});

describe('hasHostImageDimensionResolver', () => {
  it('is false before a host registers one', () => {
    expect(hasHostImageDimensionResolver()).toBe(false);
  });

  it('is true once a host registers one', () => {
    registerHostImageDimensionResolver(() => true);
    expect(hasHostImageDimensionResolver()).toBe(true);
  });
});

describe('registerHostImageDimensionResolver', () => {
  it('replaces a previously registered resolver', () => {
    registerHostImageDimensionResolver((_source, out) => {
      out.height = 1;
      out.width = 1;
      return true;
    });
    registerHostImageDimensionResolver((_source, out) => {
      out.height = 2;
      out.width = 3;
      return true;
    });
    const out = { height: 0, width: 0 };
    getHostImageSourceDimensions(sizedSource, out);

    expect(out).toStrictEqual({ height: 2, width: 3 });
  });
});

describe('unregisterHostImageDimensionResolver', () => {
  it('empties the slot so measuring reports false again', () => {
    registerHostImageDimensionResolver(() => true);
    unregisterHostImageDimensionResolver();

    expect(hasHostImageDimensionResolver()).toBe(false);
    expect(getHostImageSourceDimensions(sizedSource, { height: 0, width: 0 })).toBe(false);
  });
});
