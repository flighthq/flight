import { describe, expect, it } from 'vitest';

import type { GltfExtensionHandler } from './contract.scene3d-formats-types.ts';
import { GltfPunctualLightsExtensionHandler } from './gltfPunctualLights.ts';
import { registerGltfLightingExtensionHandlers } from './registerGltfLightingExtensionHandlers.ts';

describe('registerGltfLightingExtensionHandlers', () => {
  it('registers the punctual-light handler and replaces its existing extension kind', () => {
    const handlers: GltfExtensionHandler[] = [{ apply() {}, kind: 'KHR_lights_punctual' }];

    registerGltfLightingExtensionHandlers(handlers);

    expect(handlers).toEqual([GltfPunctualLightsExtensionHandler]);
  });
});
