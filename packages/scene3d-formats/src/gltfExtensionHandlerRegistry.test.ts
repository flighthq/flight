import type { GltfExtensionHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { registerGltfExtensionHandler } from './gltfExtensionHandlerRegistry';

describe('registerGltfExtensionHandler', () => {
  it('adds distinct source kinds and replaces duplicate kinds in place', () => {
    const first: GltfExtensionHandler = { apply() {}, kind: 'KHR_materials_clearcoat' };
    const replacement: GltfExtensionHandler = { apply() {}, kind: 'KHR_materials_clearcoat' };
    const lights: GltfExtensionHandler = { apply() {}, kind: 'KHR_lights_punctual' };
    const handlers: GltfExtensionHandler[] = [];

    registerGltfExtensionHandler(handlers, first);
    registerGltfExtensionHandler(handlers, lights);
    registerGltfExtensionHandler(handlers, replacement);

    expect(handlers).toEqual([replacement, lights]);
  });

  it('mutates only the caller-owned registry it receives', () => {
    const first: GltfExtensionHandler[] = [];
    const second: GltfExtensionHandler[] = [];
    const handler: GltfExtensionHandler = { apply() {}, kind: 'KHR_materials_clearcoat' };

    registerGltfExtensionHandler(first, handler);

    expect(first).toEqual([handler]);
    expect(second).toEqual([]);
  });
});
