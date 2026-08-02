import { packLinearToColor } from '@flighthq/color/contract';
import type { GltfDocument, SpecularGlossinessPbrMaterial } from '@flighthq/types/contract';
import { SpecularGlossinessPbrMaterialKind, StandardPbrMaterialKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfClearcoatExtensionHandler } from './gltfClearcoat';
import { parseGltf } from './gltfParse';
import { GltfSpecularGlossinessExtensionHandler } from './gltfSpecularGlossiness';

function makeGltf(material: unknown): GltfDocument {
  return {
    asset: { version: '2.0' },
    images: [{ uri: 'sg.png' }],
    materials: [material],
    samplers: [{}],
    scenes: [{ nodes: [] }],
    textures: [{ sampler: 0, source: 0 }],
  } as GltfDocument;
}

describe('GltfSpecularGlossinessExtensionHandler', () => {
  it('replaces the material with the specular-glossiness model the file authored', () => {
    // The ruling this encodes: a parser represents what the file says. Flight ships a converter to the
    // metallic-roughness lane, but running it here would be a lossy remap the caller never asked for.
    const document = parseGltf(
      makeGltf({
        extensions: {
          KHR_materials_pbrSpecularGlossiness: {
            diffuseFactor: [0.5, 0.25, 0.125, 1],
            glossinessFactor: 0.8,
            specularFactor: [0.2, 0.2, 0.2],
          },
        },
      }),
      undefined,
      { extensionHandlers: [GltfSpecularGlossinessExtensionHandler] },
    );

    expect(document.materials[0].kind).toBe(SpecularGlossinessPbrMaterialKind);
    const material = document.materials[0] as unknown as SpecularGlossinessPbrMaterial;
    expect(material.diffuse).toBe(packLinearToColor([0.5, 0.25, 0.125, 1]));
    expect(material.specular).toBe(packLinearToColor([0.2, 0.2, 0.2, 1]));
    expect(material.glossiness).toBeCloseTo(0.8, 6);
  });

  it('carries the channels both models share across the swap', () => {
    // Normal, occlusion, emissive and alpha mode are resolved by the core and mean the same thing in
    // either model — re-resolving them here could disagree with the core about sampler or color space.
    const document = parseGltf(
      makeGltf({
        alphaMode: 'MASK',
        alphaCutoff: 0.25,
        doubleSided: true,
        emissiveFactor: [1, 0, 0],
        extensions: { KHR_materials_pbrSpecularGlossiness: {} },
        name: 'Legacy',
        normalTexture: { index: 0, scale: 0.5 },
        occlusionTexture: { index: 0, strength: 0.75 },
      }),
      undefined,
      { extensionHandlers: [GltfSpecularGlossinessExtensionHandler] },
    );

    const material = document.materials[0] as unknown as SpecularGlossinessPbrMaterial;
    expect(material.name).toBe('Legacy');
    expect(material.alphaMode).toBe('mask');
    expect(material.alphaCutoff).toBeCloseTo(0.25, 6);
    expect(material.doubleSided).toBe(true);
    expect(material.normalMap).not.toBeNull();
    expect(material.normalScale).toBeCloseTo(0.5, 6);
    expect(material.occlusionMap).not.toBeNull();
    expect(material.occlusionStrength).toBeCloseTo(0.75, 6);
    expect(material.emissive).not.toBe(0);
  });

  it('samples the diffuse and packed specular-glossiness textures as sRGB', () => {
    const document = parseGltf(
      makeGltf({
        extensions: {
          KHR_materials_pbrSpecularGlossiness: {
            diffuseTexture: { index: 0 },
            specularGlossinessTexture: { index: 0 },
          },
        },
      }),
      undefined,
      { extensionHandlers: [GltfSpecularGlossinessExtensionHandler] },
    );

    const material = document.materials[0] as unknown as SpecularGlossinessPbrMaterial;
    expect(material.diffuseMap?.colorSpace).toBe('srgb');
    expect(material.specularGlossinessMap?.colorSpace).toBe('srgb');
  });

  it('takes the spec defaults for an empty block', () => {
    const document = parseGltf(makeGltf({ extensions: { KHR_materials_pbrSpecularGlossiness: {} } }), undefined, {
      extensionHandlers: [GltfSpecularGlossinessExtensionHandler],
    });

    const material = document.materials[0] as unknown as SpecularGlossinessPbrMaterial;
    expect(material.diffuse).toBe(packLinearToColor([1, 1, 1, 1]));
    expect(material.glossiness).toBe(1);
  });

  it('declines a material another handler already claimed rather than clobbering it', () => {
    // Clearcoat promotes the material to ExtendedPbrMaterial. Replacing that outright would discard the
    // sibling's work, so the swap only ever applies to the core's own metallic-roughness output.
    const document = parseGltf(
      makeGltf({
        extensions: {
          KHR_materials_clearcoat: { clearcoatFactor: 1 },
          KHR_materials_pbrSpecularGlossiness: { glossinessFactor: 0.5 },
        },
      }),
      undefined,
      { extensionHandlers: [GltfClearcoatExtensionHandler, GltfSpecularGlossinessExtensionHandler] },
    );

    expect(document.materials[0].kind).toBe('ExtendedPbrMaterial');
  });

  it('leaves a material with no spec-gloss block on the standard lane', () => {
    const document = parseGltf(makeGltf({ pbrMetallicRoughness: { roughness: 1 } }), undefined, {
      extensionHandlers: [GltfSpecularGlossinessExtensionHandler],
    });

    expect(document.materials[0].kind).toBe(StandardPbrMaterialKind);
  });
});
