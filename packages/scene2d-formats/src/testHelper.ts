import { createImageResource } from '@flighthq/image/contract';
import type { Image } from '@flighthq/types/contract';

// Node-safe fixture for format tests that inspect image dimensions but never rasterize the borrowed
// source. Keep the structural host object local to this boundary; rendering tests need a real DOM or
// canvas fixture and must declare that environment instead.
export function createReadyImageResourceForTest(width = 1, height = 1): Image {
  const source = { height, width } as unknown as CanvasImageSource;
  return createImageResource(source);
}
