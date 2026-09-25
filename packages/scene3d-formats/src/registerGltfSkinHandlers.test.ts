import type { GltfCoreFeatureHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfSkinsCoreFeatureHandler } from './gltfSkins.ts';
import { registerGltfSkinHandlers } from './registerGltfSkinHandlers.ts';

describe('registerGltfSkinHandlers', () => {
  it('registers the built-in skin handler and replaces an existing skin kind', () => {
    const handlers: GltfCoreFeatureHandler[] = [{ apply() {}, kind: 'skins' }];

    registerGltfSkinHandlers(handlers);

    expect(handlers).toEqual([GltfSkinsCoreFeatureHandler]);
  });
});
