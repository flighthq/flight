import { describe, expect, it } from 'vitest';

import type { GltfCoreFeatureHandler } from './contract.scene3d-formats-types.ts';
import { GltfAnimationsCoreFeatureHandler } from './gltfAnimations.ts';
import { registerGltfAnimationHandlers } from './registerGltfAnimationHandlers.ts';

describe('registerGltfAnimationHandlers', () => {
  it('registers the built-in animation handler and replaces an existing animation kind', () => {
    const handlers: GltfCoreFeatureHandler[] = [{ apply() {}, kind: 'animations' }];

    registerGltfAnimationHandlers(handlers);

    expect(handlers).toEqual([GltfAnimationsCoreFeatureHandler]);
  });
});
