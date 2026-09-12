import type { HostImageDimensionResolver } from '@flighthq/types/contract';

import { registerHostImageDimensionResolver, unregisterHostImageDimensionResolver } from './imageSourceDimensions';

// Measuring a borrowed handle belongs to the host, which leaves every portable package's tests needing a
// host they must not depend on: pulling @flighthq/host-web into a renderer package's tests would invert
// the layering the seam cleanup established. This is the portable stand-in — the same structural read a
// browser host performs, owned by the package that owns the seam, so a test names one dependency instead
// of hand-rolling a resolver literal.
//
// Register in beforeEach and clear in afterEach. Clearing is not tidiness: the slot is module state
// shared by every test file in a Vitest process, so a file that registers and never clears can satisfy a
// LATER file's missing registration. That is not hypothetical — it hid a real defect, where
// scene2d-canvas passed in the broad suite and failed run on its own.
export function registerTestImageDimensionResolver(): void {
  registerHostImageDimensionResolver(testImageDimensionResolver);
}

// Reads width and height off any handle that carries them, and declines one that does not, exactly as a
// host resolver must.
export const testImageDimensionResolver: HostImageDimensionResolver = (source, out): boolean => {
  const sized = source as unknown as Partial<{ height: number; width: number }>;
  if (typeof sized.width !== 'number' || typeof sized.height !== 'number') return false;
  out.height = sized.height;
  out.width = sized.width;
  return true;
};

// Pairs with registerTestImageDimensionResolver so a suite leaves the slot as it found it.
export function unregisterTestImageDimensionResolver(): void {
  unregisterHostImageDimensionResolver();
}
