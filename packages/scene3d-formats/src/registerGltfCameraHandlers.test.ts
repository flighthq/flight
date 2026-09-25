import type { GltfCoreFeatureHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfCamerasCoreFeatureHandler } from './gltfCameras.ts';
import { registerGltfCameraHandlers } from './registerGltfCameraHandlers.ts';

describe('registerGltfCameraHandlers', () => {
  it('registers the built-in camera handler and replaces an existing camera kind', () => {
    const handlers: GltfCoreFeatureHandler[] = [{ apply() {}, kind: 'cameras' }];

    registerGltfCameraHandlers(handlers);

    expect(handlers).toEqual([GltfCamerasCoreFeatureHandler]);
  });
});
