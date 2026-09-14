import type { GltfCoreFeatureHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfAnimationsCoreFeatureHandler } from './gltfAnimations';
import { registerGltfAnimationHandlers } from './registerGltfAnimationHandlers';

describe('registerGltfAnimationHandlers', () => {
  it('registers the built-in animation handler and replaces an existing animation kind', () => {
    const handlers: GltfCoreFeatureHandler[] = [{ apply() {}, kind: 'animations' }];

    registerGltfAnimationHandlers(handlers);

    expect(handlers).toEqual([GltfAnimationsCoreFeatureHandler]);
  });
});
