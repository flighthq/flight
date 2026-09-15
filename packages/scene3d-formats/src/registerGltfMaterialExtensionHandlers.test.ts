import type { GltfExtensionHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfAnisotropyExtensionHandler } from './gltfAnisotropy';
import { GltfClearcoatExtensionHandler } from './gltfClearcoat';
import { GltfEmissiveStrengthExtensionHandler } from './gltfEmissiveStrength';
import { GltfIridescenceExtensionHandler } from './gltfIridescence';
import { GltfSheenExtensionHandler } from './gltfSheen';
import { GltfSpecularExtensionHandler } from './gltfSpecular';
import { GltfSpecularGlossinessExtensionHandler } from './gltfSpecularGlossiness';
import {
  GltfIorExtensionHandler,
  GltfTransmissionExtensionHandler,
  GltfVolumeExtensionHandler,
} from './gltfTransmissionVolume';
import { GltfUnlitExtensionHandler } from './gltfUnlit';
import { registerGltfMaterialExtensionHandlers } from './registerGltfMaterialExtensionHandlers';

describe('registerGltfMaterialExtensionHandlers', () => {
  it('registers every built-in material extension and replaces existing kinds', () => {
    const stub: GltfExtensionHandler = { apply() {}, kind: 'KHR_materials_anisotropy' };
    const handlers: GltfExtensionHandler[] = [stub];

    registerGltfMaterialExtensionHandlers(handlers);

    for (const handler of [
      GltfAnisotropyExtensionHandler,
      GltfClearcoatExtensionHandler,
      GltfEmissiveStrengthExtensionHandler,
      GltfIorExtensionHandler,
      GltfIridescenceExtensionHandler,
      GltfSheenExtensionHandler,
      GltfSpecularExtensionHandler,
      GltfSpecularGlossinessExtensionHandler,
      GltfTransmissionExtensionHandler,
      GltfUnlitExtensionHandler,
      GltfVolumeExtensionHandler,
    ]) {
      expect(handlers, handler.kind).toContain(handler);
    }
    const kinds = handlers.map((handler) => handler.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(handlers).not.toContain(stub);
    expect(handlers[0]).toBe(GltfAnisotropyExtensionHandler);
  });
});
