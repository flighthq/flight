import type { GltfCoreFeatureHandler, GltfExtensionHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfAnimationsCoreFeatureHandler } from './gltfAnimations';
import { GltfCamerasCoreFeatureHandler } from './gltfCameras';
import { GltfPunctualLightsExtensionHandler } from './gltfPunctualLights';
import { GltfSkinsCoreFeatureHandler } from './gltfSkins';
import { registerAllGltfHandlers } from './registerAllGltfHandlers';

describe('registerAllGltfHandlers', () => {
  it('registers every built-in optional family across both handler lists', () => {
    const coreFeatureHandlers: GltfCoreFeatureHandler[] = [{ apply() {}, kind: 'cameras' }];
    const extensionHandlers: GltfExtensionHandler[] = [];

    registerAllGltfHandlers(coreFeatureHandlers, extensionHandlers);

    expect(coreFeatureHandlers).toEqual([
      GltfCamerasCoreFeatureHandler,
      GltfAnimationsCoreFeatureHandler,
      GltfSkinsCoreFeatureHandler,
    ]);
    expect(extensionHandlers).toHaveLength(12);
    expect(extensionHandlers.at(-1)).toBe(GltfPunctualLightsExtensionHandler);
  });
});
