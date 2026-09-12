import type { HostImageSource } from '@flighthq/types/contract';

import { getHostImageSourceDimensions, hasHostImageDimensionResolver } from './imageSourceDimensions';
import {
  registerTestImageDimensionResolver,
  testImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from './imageTestHelper';

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

describe('registerTestImageDimensionResolver', () => {
  it('fills the slot so a portable test can measure a sized handle', () => {
    registerTestImageDimensionResolver();
    const out = { height: 0, width: 0 };

    expect(hasHostImageDimensionResolver()).toBe(true);
    expect(getHostImageSourceDimensions({ height: 3, width: 9 } as unknown as HostImageSource, out)).toBe(true);
    expect(out).toStrictEqual({ height: 3, width: 9 });
  });
});

describe('testImageDimensionResolver', () => {
  it('reads width and height off a sized handle', () => {
    const out = { height: 0, width: 0 };

    expect(testImageDimensionResolver({ height: 6, width: 12 } as unknown as HostImageSource, out)).toBe(true);
    expect(out).toStrictEqual({ height: 6, width: 12 });
  });

  // Declining rather than reporting zero is the resolver contract, and the stand-in has to honor it or a
  // test would prove something the real host does not do.
  it('declines a handle carrying no numeric size and leaves out untouched', () => {
    const out = { height: 5, width: 7 };

    expect(testImageDimensionResolver({} as unknown as HostImageSource, out)).toBe(false);
    expect(out).toStrictEqual({ height: 5, width: 7 });
  });
});

describe('unregisterTestImageDimensionResolver', () => {
  it('empties the slot so no later test file inherits this one', () => {
    registerTestImageDimensionResolver();
    unregisterTestImageDimensionResolver();

    expect(hasHostImageDimensionResolver()).toBe(false);
  });
});
