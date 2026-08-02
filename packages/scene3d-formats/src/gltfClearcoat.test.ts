import type { ClearcoatPbrExtension, ExtendedPbrMaterial, GltfDocument } from '@flighthq/types/contract';
import { ExtendedPbrMaterialKind, StandardPbrMaterialKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfClearcoatExtensionHandler } from './gltfClearcoat';
import { parseGltf } from './gltfParse';

function makeGltf(material: unknown): GltfDocument {
  return {
    asset: { version: '2.0' },
    images: [{ uri: 'coat.png' }],
    materials: [material],
    samplers: [{}],
    scenes: [{ nodes: [] }],
    textures: [{ sampler: 0, source: 0 }],
  } as GltfDocument;
}

describe('GltfClearcoatExtensionHandler', () => {
  it('attaches a clearcoat extension carrying the file’s factors', () => {
    const document = parseGltf(
      makeGltf({ extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.8, clearcoatRoughnessFactor: 0.2 } } }),
      undefined,
      { extensionHandlers: [GltfClearcoatExtensionHandler] },
    );

    const extended = document.materials[0] as unknown as ExtendedPbrMaterial;
    expect(extended.kind).toBe(ExtendedPbrMaterialKind);
    const clearcoat = extended.extensions[0] as ClearcoatPbrExtension;
    expect(clearcoat.clearcoat).toBeCloseTo(0.8, 6);
    expect(clearcoat.clearcoatRoughness).toBeCloseTo(0.2, 6);
  });

  it('resolves the clearcoat textures as LINEAR data, not color', () => {
    // The factor rides the red channel and the roughness the green; gamma-decoding either would change
    // the value the shader reads.
    const document = parseGltf(
      makeGltf({
        extensions: {
          KHR_materials_clearcoat: {
            clearcoatNormalTexture: { index: 0, scale: 0.5 },
            clearcoatRoughnessTexture: { index: 0 },
            clearcoatTexture: { index: 0 },
          },
        },
      }),
      undefined,
      { extensionHandlers: [GltfClearcoatExtensionHandler] },
    );

    const clearcoat = (document.materials[0] as unknown as ExtendedPbrMaterial).extensions[0] as ClearcoatPbrExtension;
    expect(clearcoat.clearcoatMap?.colorSpace).toBe('linear');
    expect(clearcoat.clearcoatRoughnessMap?.colorSpace).toBe('linear');
    expect(clearcoat.clearcoatNormalMap?.colorSpace).toBe('linear');
    expect(clearcoat.clearcoatNormalScale).toBeCloseTo(0.5, 6);
    // The extension's textures must reference the document's own resource table, like the base material's.
    expect(document.resources.length).toBeGreaterThan(0);
  });

  it('takes the spec defaults for an extension block stating nothing', () => {
    const document = parseGltf(makeGltf({ extensions: { KHR_materials_clearcoat: {} } }), undefined, {
      extensionHandlers: [GltfClearcoatExtensionHandler],
    });

    const clearcoat = (document.materials[0] as unknown as ExtendedPbrMaterial).extensions[0] as ClearcoatPbrExtension;
    expect(clearcoat.clearcoat).toBe(0);
    expect(clearcoat.clearcoatRoughness).toBe(0);
  });

  it('leaves a material with no clearcoat block on the standard lane', () => {
    const document = parseGltf(makeGltf({ pbrMetallicRoughness: { roughness: 1 } }), undefined, {
      extensionHandlers: [GltfClearcoatExtensionHandler],
    });

    expect(document.materials[0].kind).toBe(StandardPbrMaterialKind);
  });
});
