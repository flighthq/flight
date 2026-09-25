import type { GltfExtensionHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfPunctualLightsExtensionHandler } from './gltfPunctualLights.ts';
import { registerGltfLightingExtensionHandlers } from './registerGltfLightingExtensionHandlers.ts';

describe('registerGltfLightingExtensionHandlers', () => {
  it('registers the punctual-light handler and replaces its existing extension kind', () => {
    const handlers: GltfExtensionHandler[] = [{ apply() {}, kind: 'KHR_lights_punctual' }];

    registerGltfLightingExtensionHandlers(handlers);

    expect(handlers).toEqual([GltfPunctualLightsExtensionHandler]);
  });
});
