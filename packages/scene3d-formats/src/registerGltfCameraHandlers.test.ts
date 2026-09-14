import type { GltfCoreFeatureHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfCamerasCoreFeatureHandler } from './gltfCameras';
import { registerGltfCameraHandlers } from './registerGltfCameraHandlers';

describe('registerGltfCameraHandlers', () => {
  it('registers the built-in camera handler and replaces an existing camera kind', () => {
    const handlers: GltfCoreFeatureHandler[] = [{ apply() {}, kind: 'cameras' }];

    registerGltfCameraHandlers(handlers);

    expect(handlers).toEqual([GltfCamerasCoreFeatureHandler]);
  });
});
