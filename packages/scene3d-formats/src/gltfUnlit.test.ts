import type { GltfDocument, UnlitMaterial } from '@flighthq/types/contract';
import { StandardPbrMaterialKind, UnlitMaterialKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfClearcoatExtensionHandler } from './gltfClearcoat';
import { parseGltf } from './gltfParse';
import { GltfUnlitExtensionHandler } from './gltfUnlit';

function makeGltf(material: unknown): GltfDocument {
  return {
    asset: { version: '2.0' },
    images: [{ uri: 'albedo.png' }],
    materials: [material],
    samplers: [{}],
    scenes: [{ nodes: [] }],
    textures: [{ sampler: 0, source: 0 }],
  } as GltfDocument;
}

describe('GltfUnlitExtensionHandler', () => {
  it('replaces the material with an unlit one carrying the base color across', () => {
    const document = parseGltf(
      makeGltf({
        extensions: { KHR_materials_unlit: {} },
        pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1], baseColorTexture: { index: 0 } },
      }),
      undefined,
      { extensionHandlers: [GltfUnlitExtensionHandler] },
    );

    expect(document.materials[0].kind).toBe(UnlitMaterialKind);
    const material = document.materials[0] as unknown as UnlitMaterial;
    expect(material.baseColor).toBe(0xff0000ff);
    expect(material.baseColorMap).not.toBeNull();
  });

  it('carries the alpha state across, which unlit still needs', () => {
    const document = parseGltf(
      makeGltf({
        alphaCutoff: 0.75,
        alphaMode: 'MASK',
        doubleSided: true,
        extensions: { KHR_materials_unlit: {} },
        name: 'Billboard',
      }),
      undefined,
      { extensionHandlers: [GltfUnlitExtensionHandler] },
    );

    const material = document.materials[0] as unknown as UnlitMaterial;
    expect(material.name).toBe('Billboard');
    expect(material.alphaMode).toBe('mask');
    expect(material.alphaCutoff).toBeCloseTo(0.75, 6);
    expect(material.doubleSided).toBe(true);
  });

  it('leaves the material lit when the handler is not imported', () => {
    const document = parseGltf(makeGltf({ extensions: { KHR_materials_unlit: {} } }));
    expect(document.materials[0].kind).toBe(StandardPbrMaterialKind);
  });

  it('declines a material another handler already claimed', () => {
    const document = parseGltf(
      makeGltf({ extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1 }, KHR_materials_unlit: {} } }),
      undefined,
      { extensionHandlers: [GltfClearcoatExtensionHandler, GltfUnlitExtensionHandler] },
    );

    expect(document.materials[0].kind).toBe('ExtendedPbrMaterial');
  });
});
