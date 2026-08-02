import { packLinearToColor } from '@flighthq/color/contract';
import type { ExtendedPbrMaterial, GltfDocument, TransmissionVolumePbrExtension } from '@flighthq/types/contract';
import { TransmissionVolumePbrExtensionKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseGltf } from './gltfParse';
import {
  GltfIorExtensionHandler,
  GltfTransmissionExtensionHandler,
  GltfVolumeExtensionHandler,
} from './gltfTransmissionVolume';

function makeGltf(material: unknown): GltfDocument {
  return {
    asset: { version: '2.0' },
    images: [{ uri: 'glass.png' }],
    materials: [material],
    samplers: [{}],
    scenes: [{ nodes: [] }],
    textures: [{ sampler: 0, source: 0 }],
  } as GltfDocument;
}

function extensionOf(document: ReturnType<typeof parseGltf>): TransmissionVolumePbrExtension {
  const extended = document.materials[0] as unknown as ExtendedPbrMaterial;
  const found = extended.extensions.find((e) => e.kind === TransmissionVolumePbrExtensionKind);
  expect(found).toBeDefined();
  return found as TransmissionVolumePbrExtension;
}

describe('GltfIorExtensionHandler', () => {
  it('imports the stated index of refraction', () => {
    const document = parseGltf(makeGltf({ extensions: { KHR_materials_ior: { ior: 1.33 } } }), undefined, {
      extensionHandlers: [GltfIorExtensionHandler],
    });

    expect(extensionOf(document).ior).toBeCloseTo(1.33, 6);
  });

  it('takes the spec default of 1.5 for an empty block', () => {
    const document = parseGltf(makeGltf({ extensions: { KHR_materials_ior: {} } }), undefined, {
      extensionHandlers: [GltfIorExtensionHandler],
    });

    expect(extensionOf(document).ior).toBeCloseTo(1.5, 6);
  });

  it('fills ONE shared descriptor when all three handlers run, in either order', () => {
    // The reason findGltfPbrExtension exists: three glTF extensions map to one Flight descriptor, and
    // handler order is not guaranteed, so none may assume it is the one that created it.
    const source = makeGltf({
      extensions: {
        KHR_materials_ior: { ior: 1.4 },
        KHR_materials_transmission: { transmissionFactor: 0.7 },
        KHR_materials_volume: { thicknessFactor: 5 },
      },
    });
    const forward = parseGltf(source, undefined, {
      extensionHandlers: [GltfTransmissionExtensionHandler, GltfVolumeExtensionHandler, GltfIorExtensionHandler],
    });
    const reversed = parseGltf(source, undefined, {
      extensionHandlers: [GltfIorExtensionHandler, GltfVolumeExtensionHandler, GltfTransmissionExtensionHandler],
    });

    for (const document of [forward, reversed]) {
      const extended = document.materials[0] as unknown as ExtendedPbrMaterial;
      // One descriptor, not three — the siblings found each other's work.
      expect(extended.extensions).toHaveLength(1);
      const ext = extensionOf(document);
      expect(ext.transmission).toBeCloseTo(0.7, 6);
      expect(ext.thickness).toBeCloseTo(5, 6);
      expect(ext.ior).toBeCloseTo(1.4, 6);
    }
  });
});

describe('GltfTransmissionExtensionHandler', () => {
  it('imports the transmission factor and its linear map', () => {
    const document = parseGltf(
      makeGltf({
        extensions: { KHR_materials_transmission: { transmissionFactor: 0.9, transmissionTexture: { index: 0 } } },
      }),
      undefined,
      { extensionHandlers: [GltfTransmissionExtensionHandler] },
    );

    const ext = extensionOf(document);
    expect(ext.transmission).toBeCloseTo(0.9, 6);
    expect(ext.transmissionMap?.colorSpace).toBe('linear');
  });

  it('works alone, without the volume or ior siblings', () => {
    // A thin refractive surface states transmission and nothing else — the descriptor must still attach.
    const document = parseGltf(
      makeGltf({ extensions: { KHR_materials_transmission: { transmissionFactor: 1 } } }),
      undefined,
      { extensionHandlers: [GltfTransmissionExtensionHandler] },
    );

    expect(extensionOf(document).transmission).toBe(1);
  });
});

describe('GltfVolumeExtensionHandler', () => {
  it('imports thickness and sRGB-encodes the linear attenuation color', () => {
    const document = parseGltf(
      makeGltf({
        extensions: {
          KHR_materials_volume: {
            attenuationColor: [0.5, 0.25, 0.125],
            attenuationDistance: 3,
            thicknessFactor: 2,
            thicknessTexture: { index: 0 },
          },
        },
      }),
      undefined,
      { extensionHandlers: [GltfVolumeExtensionHandler] },
    );

    const ext = extensionOf(document);
    expect(ext.thickness).toBeCloseTo(2, 6);
    expect(ext.attenuationDistance).toBeCloseTo(3, 6);
    expect(ext.attenuationColor).toBe(packLinearToColor([0.5, 0.25, 0.125, 1]));
    expect(ext.thicknessMap?.colorSpace).toBe('linear');
  });

  it('defaults attenuation distance to infinity — a volume that never absorbs', () => {
    const document = parseGltf(makeGltf({ extensions: { KHR_materials_volume: {} } }), undefined, {
      extensionHandlers: [GltfVolumeExtensionHandler],
    });

    expect(extensionOf(document).attenuationDistance).toBe(Number.POSITIVE_INFINITY);
  });
});
