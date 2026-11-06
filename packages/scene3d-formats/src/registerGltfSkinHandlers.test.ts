import { describe, expect, it } from 'vitest';

import type { GltfCoreFeatureHandler } from './contract.scene3d-formats-types.ts';
import { GltfSkinsCoreFeatureHandler } from './gltfSkins.ts';
import { registerGltfSkinHandlers } from './registerGltfSkinHandlers.ts';

describe('registerGltfSkinHandlers', () => {
  it('registers the built-in skin handler and replaces an existing skin kind', () => {
    const handlers: GltfCoreFeatureHandler[] = [{ apply() {}, kind: 'skins' }];

    registerGltfSkinHandlers(handlers);

    expect(handlers).toEqual([GltfSkinsCoreFeatureHandler]);
  });
});
