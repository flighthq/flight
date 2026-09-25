import type { GltfCoreFeatureHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { registerGltfCoreFeatureHandler } from './gltfCoreFeatureRegistry.ts';

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

  it('mutates only the caller-owned registry it receives', () => {
    const first: GltfCoreFeatureHandler[] = [];
    const second: GltfCoreFeatureHandler[] = [];
    const handler: GltfCoreFeatureHandler = { apply() {}, kind: 'animations' };

    registerGltfCoreFeatureHandler(first, handler);

    expect(first).toEqual([handler]);
    expect(second).toEqual([]);
  });
});
