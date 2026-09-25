import type { GltfCoreFeatureHandler, GltfExtensionHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfCamerasCoreFeatureHandler } from './gltfCameras.ts';
import { registerAllGltfHandlers } from './registerAllGltfHandlers.ts';
import { registerGltfAnimationHandlers } from './registerGltfAnimationHandlers.ts';
import { registerGltfCameraHandlers } from './registerGltfCameraHandlers.ts';
import { registerGltfLightingExtensionHandlers } from './registerGltfLightingExtensionHandlers.ts';
import { registerGltfMaterialExtensionHandlers } from './registerGltfMaterialExtensionHandlers.ts';
import { registerGltfSkinHandlers } from './registerGltfSkinHandlers.ts';

describe('registerAllGltfHandlers', () => {
  it('registers every built-in optional family across both handler lists', () => {
    const cameraStub: GltfCoreFeatureHandler = { apply() {}, kind: 'cameras' };
    const coreFeatureHandlers: GltfCoreFeatureHandler[] = [cameraStub];
    const extensionHandlers: GltfExtensionHandler[] = [];

    registerAllGltfHandlers(coreFeatureHandlers, extensionHandlers);

    const expectedCoreFeatureHandlers: GltfCoreFeatureHandler[] = [cameraStub];
    registerGltfAnimationHandlers(expectedCoreFeatureHandlers);
    registerGltfCameraHandlers(expectedCoreFeatureHandlers);
    registerGltfSkinHandlers(expectedCoreFeatureHandlers);
    const expectedExtensionHandlers: GltfExtensionHandler[] = [];
    registerGltfMaterialExtensionHandlers(expectedExtensionHandlers);
    registerGltfLightingExtensionHandlers(expectedExtensionHandlers);

    expect(coreFeatureHandlers).toEqual(expectedCoreFeatureHandlers);
    expect(extensionHandlers).toEqual(expectedExtensionHandlers);
    expect(coreFeatureHandlers[0]).toBe(GltfCamerasCoreFeatureHandler);
    expect(coreFeatureHandlers).not.toContain(cameraStub);
  });
});
