import { packLinearToColor } from '@flighthq/color/contract';
import type { ExtendedPbrMaterial, GltfDocument, SpecularPbrExtension } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseGltf } from './gltfParse';
import { GltfSpecularExtensionHandler } from './gltfSpecular';

function makeGltf(material: unknown): GltfDocument {
  return {
    asset: { version: '2.0' },
    images: [{ uri: 'spec.png' }],
    materials: [material],
    samplers: [{}],
    scenes: [{ nodes: [] }],
    textures: [{ sampler: 0, source: 0 }],
  } as GltfDocument;
}

function extensionOf(document: ReturnType<typeof parseGltf>): SpecularPbrExtension {
  return (document.materials[0] as unknown as ExtendedPbrMaterial).extensions[0] as SpecularPbrExtension;
}

describe('GltfSpecularExtensionHandler', () => {
  it('imports the strength and sRGB-encodes the linear specular color', () => {
    const document = parseGltf(
      makeGltf({
        extensions: { KHR_materials_specular: { specularColorFactor: [0.2, 0.4, 0.6], specularFactor: 0.3 } },
      }),
      undefined,
      { extensionHandlers: [GltfSpecularExtensionHandler] },
    );

    const ext = extensionOf(document);
    expect(ext.specular).toBeCloseTo(0.3, 6);
    expect(ext.specularColor).toBe(packLinearToColor([0.2, 0.4, 0.6, 1]));
  });

  it('splits the two textures by color space, because they split by channel', () => {
    // The strength rides the ALPHA of specularTexture (data); specularColorTexture is RGB color.
    const document = parseGltf(
      makeGltf({
        extensions: {
          KHR_materials_specular: { specularColorTexture: { index: 0 }, specularTexture: { index: 0 } },
        },
      }),
      undefined,
      { extensionHandlers: [GltfSpecularExtensionHandler] },
    );

    const ext = extensionOf(document);
    expect(ext.specularMap?.colorSpace).toBe('linear');
    expect(ext.specularColorMap?.colorSpace).toBe('srgb');
  });

  it('defaults both factors to full, so an empty block is the same surface as no extension', () => {
    const document = parseGltf(makeGltf({ extensions: { KHR_materials_specular: {} } }), undefined, {
      extensionHandlers: [GltfSpecularExtensionHandler],
    });

    const ext = extensionOf(document);
    expect(ext.specular).toBe(1);
    expect(ext.specularColor).toBe(packLinearToColor([1, 1, 1, 1]));
  });
});
