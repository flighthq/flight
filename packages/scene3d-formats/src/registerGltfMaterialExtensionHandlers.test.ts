import type { GltfExtensionHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfAnisotropyExtensionHandler } from './gltfAnisotropy.ts';
import { GltfClearcoatExtensionHandler } from './gltfClearcoat.ts';
import { GltfEmissiveStrengthExtensionHandler } from './gltfEmissiveStrength.ts';
import { GltfIridescenceExtensionHandler } from './gltfIridescence.ts';
import { GltfSheenExtensionHandler } from './gltfSheen.ts';
import { GltfSpecularExtensionHandler } from './gltfSpecular.ts';
import { GltfSpecularGlossinessExtensionHandler } from './gltfSpecularGlossiness.ts';
import {
  GltfIorExtensionHandler,
  GltfTransmissionExtensionHandler,
  GltfVolumeExtensionHandler,
} from './gltfTransmissionVolume.ts';
import { GltfUnlitExtensionHandler } from './gltfUnlit.ts';
import { registerGltfMaterialExtensionHandlers } from './registerGltfMaterialExtensionHandlers.ts';

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
