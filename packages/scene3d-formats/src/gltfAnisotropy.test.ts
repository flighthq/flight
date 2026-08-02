import type { AnisotropyPbrExtension, ExtendedPbrMaterial, GltfDocument } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfAnisotropyExtensionHandler } from './gltfAnisotropy';
import { parseGltf } from './gltfParse';

function makeGltf(material: unknown): GltfDocument {
  return {
    asset: { version: '2.0' },
    images: [{ uri: 'brushed.png' }],
    materials: [material],
    samplers: [{}],
    scenes: [{ nodes: [] }],
    textures: [{ sampler: 0, source: 0 }],
  } as GltfDocument;
}

describe('GltfAnisotropyExtensionHandler', () => {
  it('imports strength, rotation, and the linear direction+strength map', () => {
    const document = parseGltf(
      makeGltf({
        extensions: {
          KHR_materials_anisotropy: {
            anisotropyRotation: 1.5,
            anisotropyStrength: 0.7,
            anisotropyTexture: { index: 0 },
          },
        },
      }),
      undefined,
      { extensionHandlers: [GltfAnisotropyExtensionHandler] },
    );

    const ext = (document.materials[0] as unknown as ExtendedPbrMaterial).extensions[0] as AnisotropyPbrExtension;
    expect(ext.anisotropyStrength).toBeCloseTo(0.7, 6);
    // Radians, not degrees — the map packs a tangent-space direction, so this is a math-layer angle.
    expect(ext.anisotropyRotation).toBeCloseTo(1.5, 6);
    expect(ext.anisotropyMap?.colorSpace).toBe('linear');
  });

  it('takes the spec default of no anisotropy for an empty block', () => {
    const document = parseGltf(makeGltf({ extensions: { KHR_materials_anisotropy: {} } }), undefined, {
      extensionHandlers: [GltfAnisotropyExtensionHandler],
    });

    const ext = (document.materials[0] as unknown as ExtendedPbrMaterial).extensions[0] as AnisotropyPbrExtension;
    expect(ext.anisotropyStrength).toBe(0);
    expect(ext.anisotropyRotation).toBe(0);
  });
});
