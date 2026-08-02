import { packLinearToColor } from '@flighthq/color/contract';
import type { ExtendedPbrMaterial, GltfDocument, SheenPbrExtension } from '@flighthq/types/contract';
import { ExtendedPbrMaterialKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseGltf } from './gltfParse';
import { GltfSheenExtensionHandler } from './gltfSheen';

function makeGltf(material: unknown): GltfDocument {
  return {
    asset: { version: '2.0' },
    images: [{ uri: 'cloth.png' }],
    materials: [material],
    samplers: [{}],
    scenes: [{ nodes: [] }],
    textures: [{ sampler: 0, source: 0 }],
  } as GltfDocument;
}

describe('GltfSheenExtensionHandler', () => {
  it('sRGB-encodes the linear sheen color factor the file states', () => {
    // glTF factors are LINEAR while Flight's packed colors are sRGB-encoded, so a raw pack would darken
    // the sheen. Comparing against packLinearToColor pins the conversion rather than a magic constant.
    const document = parseGltf(
      makeGltf({ extensions: { KHR_materials_sheen: { sheenColorFactor: [0.5, 0.25, 0.125] } } }),
      undefined,
      { extensionHandlers: [GltfSheenExtensionHandler] },
    );

    const extended = document.materials[0] as unknown as ExtendedPbrMaterial;
    expect(extended.kind).toBe(ExtendedPbrMaterialKind);
    const sheen = extended.extensions[0] as SheenPbrExtension;
    expect(sheen.sheenColor).toBe(packLinearToColor([0.5, 0.25, 0.125, 1]));
  });

  it('samples the color map as sRGB and the roughness map as linear', () => {
    const document = parseGltf(
      makeGltf({
        extensions: {
          KHR_materials_sheen: {
            sheenColorTexture: { index: 0 },
            sheenRoughnessFactor: 0.6,
            sheenRoughnessTexture: { index: 0 },
          },
        },
      }),
      undefined,
      { extensionHandlers: [GltfSheenExtensionHandler] },
    );

    const sheen = (document.materials[0] as unknown as ExtendedPbrMaterial).extensions[0] as SheenPbrExtension;
    expect(sheen.sheenColorMap?.colorSpace).toBe('srgb');
    expect(sheen.sheenRoughnessMap?.colorSpace).toBe('linear');
    expect(sheen.sheenRoughness).toBeCloseTo(0.6, 6);
  });

  it('takes the spec default of no sheen for an empty block', () => {
    const document = parseGltf(makeGltf({ extensions: { KHR_materials_sheen: {} } }), undefined, {
      extensionHandlers: [GltfSheenExtensionHandler],
    });

    const sheen = (document.materials[0] as unknown as ExtendedPbrMaterial).extensions[0] as SheenPbrExtension;
    expect(sheen.sheenColor).toBe(packLinearToColor([0, 0, 0, 1]));
    expect(sheen.sheenRoughness).toBe(0);
  });
});
