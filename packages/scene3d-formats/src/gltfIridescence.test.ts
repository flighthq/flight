import type { ExtendedPbrMaterial, GltfDocument, IridescencePbrExtension } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfIridescenceExtensionHandler } from './gltfIridescence';
import { parseGltf } from './gltfParse';

function makeGltf(material: unknown): GltfDocument {
  return {
    asset: { version: '2.0' },
    images: [{ uri: 'film.png' }],
    materials: [material],
    samplers: [{}],
    scenes: [{ nodes: [] }],
    textures: [{ sampler: 0, source: 0 }],
  } as GltfDocument;
}

function extensionOf(document: ReturnType<typeof parseGltf>): IridescencePbrExtension {
  return (document.materials[0] as unknown as ExtendedPbrMaterial).extensions[0] as IridescencePbrExtension;
}

describe('GltfIridescenceExtensionHandler', () => {
  it('imports the factor, IOR, and nanometre thickness bounds', () => {
    const document = parseGltf(
      makeGltf({
        extensions: {
          KHR_materials_iridescence: {
            iridescenceFactor: 0.8,
            iridescenceIor: 1.8,
            iridescenceThicknessMaximum: 900,
            iridescenceThicknessMinimum: 200,
          },
        },
      }),
      undefined,
      { extensionHandlers: [GltfIridescenceExtensionHandler] },
    );

    const ext = extensionOf(document);
    expect(ext.iridescence).toBeCloseTo(0.8, 6);
    expect(ext.iridescenceIor).toBeCloseTo(1.8, 6);
    expect(ext.iridescenceThicknessMin).toBe(200);
    expect(ext.iridescenceThicknessMax).toBe(900);
  });

  it('keeps both thickness bounds even when a thickness texture is present', () => {
    // The texture's green channel INTERPOLATES between the bounds rather than carrying an absolute
    // depth, so dropping either bound would change what the map means.
    const document = parseGltf(
      makeGltf({
        extensions: { KHR_materials_iridescence: { iridescenceThicknessTexture: { index: 0 } } },
      }),
      undefined,
      { extensionHandlers: [GltfIridescenceExtensionHandler] },
    );

    const ext = extensionOf(document);
    expect(ext.iridescenceThicknessMap?.colorSpace).toBe('linear');
    expect(ext.iridescenceThicknessMin).toBe(100);
    expect(ext.iridescenceThicknessMax).toBe(400);
  });

  it('takes the spec defaults for an empty block', () => {
    const document = parseGltf(makeGltf({ extensions: { KHR_materials_iridescence: {} } }), undefined, {
      extensionHandlers: [GltfIridescenceExtensionHandler],
    });

    const ext = extensionOf(document);
    expect(ext.iridescence).toBe(0);
    expect(ext.iridescenceIor).toBeCloseTo(1.3, 6);
  });
});
