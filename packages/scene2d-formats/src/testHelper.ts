import type { ImageResource } from '@flighthq/types/contract';
import { EntityRuntimeKey, ImageTextureSourceKind } from '@flighthq/types/contract';

// Node-safe fixture for format tests that inspect image dimensions but never rasterize the borrowed
// source. Keep the structural host object local to this boundary; rendering tests need a real DOM or
// canvas fixture and must declare that environment instead.
export function createReadyImageResourceForTest(width = 1, height = 1): ImageResource {
  const source = { height, width } as unknown as CanvasImageSource;
  return {
    [EntityRuntimeKey]: undefined,
    height,
    alphaType: 'straight',
    gamut: 'srgb',
    kind: ImageTextureSourceKind,
    source,
    version: 0,
    width,
  };
}
