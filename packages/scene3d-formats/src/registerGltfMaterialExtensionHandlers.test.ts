import type { GltfExtensionHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfAnisotropyExtensionHandler } from './gltfAnisotropy';
import { GltfUnlitExtensionHandler } from './gltfUnlit';
import { registerGltfMaterialExtensionHandlers } from './registerGltfMaterialExtensionHandlers';

describe('registerGltfMaterialExtensionHandlers', () => {
  it('registers every built-in material extension and replaces existing kinds', () => {
    const handlers: GltfExtensionHandler[] = [{ apply() {}, kind: 'KHR_materials_anisotropy' }];

    registerGltfMaterialExtensionHandlers(handlers);

    expect(handlers).toHaveLength(11);
    expect(handlers[0]).toBe(GltfAnisotropyExtensionHandler);
    expect(handlers.at(-1)).toBe(GltfUnlitExtensionHandler);
  });
});
