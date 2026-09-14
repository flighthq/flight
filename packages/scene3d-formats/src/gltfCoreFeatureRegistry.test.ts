import type { GltfCoreFeatureHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { registerGltfCoreFeatureHandler } from './gltfCoreFeatureRegistry';

describe('registerGltfCoreFeatureHandler', () => {
  it('adds distinct source kinds and replaces duplicate kinds in place', () => {
    const first: GltfCoreFeatureHandler = { apply() {}, kind: 'animations' };
    const replacement: GltfCoreFeatureHandler = { apply() {}, kind: 'animations' };
    const cameras: GltfCoreFeatureHandler = { apply() {}, kind: 'cameras' };
    const handlers: GltfCoreFeatureHandler[] = [];

    registerGltfCoreFeatureHandler(handlers, first);
    registerGltfCoreFeatureHandler(handlers, cameras);
    registerGltfCoreFeatureHandler(handlers, replacement);

    expect(handlers).toEqual([replacement, cameras]);
  });
});
