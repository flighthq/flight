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

    expect(coreFeatureHandlers.map((handler) => handler.kind)).toEqual(['cameras', 'animations', 'skins']);
    expect(extensionHandlers.map((handler) => handler.kind)).toEqual([
      'KHR_materials_anisotropy',
      'KHR_materials_clearcoat',
      'KHR_materials_emissive_strength',
      'KHR_materials_iridescence',
      'KHR_materials_sheen',
      'KHR_materials_specular',
      'KHR_materials_pbrSpecularGlossiness',
      'KHR_materials_ior',
      'KHR_materials_transmission',
      'KHR_materials_volume',
      'KHR_materials_unlit',
      'KHR_lights_punctual',
    ]);
    expect(coreFeatureHandlers).toEqual([
      GltfCamerasCoreFeatureHandler,
      GltfAnimationsCoreFeatureHandler,
      GltfSkinsCoreFeatureHandler,
    ]);
    expect(extensionHandlers.at(-1)).toBe(GltfPunctualLightsExtensionHandler);
  });
});
