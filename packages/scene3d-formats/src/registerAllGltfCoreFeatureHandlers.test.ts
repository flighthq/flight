import type { GltfCoreFeatureHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfAnimationsCoreFeatureHandler } from './gltfAnimations';
import { GltfCamerasCoreFeatureHandler } from './gltfCameras';
import { GltfSkinsCoreFeatureHandler } from './gltfSkins';
import { registerAllGltfCoreFeatureHandlers } from './registerAllGltfCoreFeatureHandlers';

describe('registerAllGltfCoreFeatureHandlers', () => {
  it('registers every built-in optional core family without duplicating source kinds', () => {
    const handlers: GltfCoreFeatureHandler[] = [{ apply() {}, kind: 'cameras' }];

    registerAllGltfCoreFeatureHandlers(handlers);

    expect(handlers).toEqual([
      GltfCamerasCoreFeatureHandler,
      GltfAnimationsCoreFeatureHandler,
      GltfSkinsCoreFeatureHandler,
    ]);
  });
});
