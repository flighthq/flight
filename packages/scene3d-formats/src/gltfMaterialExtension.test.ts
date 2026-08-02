import {
  createClearcoatPbrExtension,
  createSheenPbrExtension,
  createStandardPbrMaterial,
} from '@flighthq/materials/contract';
import type {
  ClearcoatPbrExtension,
  ExtendedPbrMaterial,
  MaterialLike,
  Scene3DDocument,
  StandardPbrMaterial,
} from '@flighthq/types/contract';
import { ExtendedPbrMaterialKind, StandardPbrMaterialKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { attachGltfPbrExtension } from './gltfMaterialExtension';

function makeDocument(material: MaterialLike): Scene3DDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [material],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [{ rootNodes: [] }],
    skins: [],
  };
}

describe('attachGltfPbrExtension', () => {
  it('promotes a standard material and carries its resolved fields into the standard block', () => {
    const standard = createStandardPbrMaterial({ baseColor: 0x112233ff, metallic: 0.25, roughness: 0.75 });
    standard.alphaMode = 'mask';
    standard.alphaCutoff = 0.25;
    standard.doubleSided = true;
    standard.name = 'Coated';
    const document = makeDocument(standard as unknown as MaterialLike);

    expect(attachGltfPbrExtension(document, 0, createClearcoatPbrExtension({ clearcoat: 1 }))).toBe(true);

    const extended = document.materials[0] as unknown as ExtendedPbrMaterial;
    expect(extended.kind).toBe(ExtendedPbrMaterialKind);
    // The base shading the core resolved must survive promotion, not be reset to constructor defaults.
    expect(extended.standard.baseColor).toBe(0x112233ff);
    expect(extended.standard.metallic).toBeCloseTo(0.25, 6);
    expect(extended.standard.roughness).toBeCloseTo(0.75, 6);
    expect(extended.alphaMode).toBe('mask');
    expect(extended.alphaCutoff).toBeCloseTo(0.25, 6);
    expect(extended.doubleSided).toBe(true);
    expect(extended.name).toBe('Coated');
  });

  it('composes two independently imported extensions onto one material', () => {
    // The case that makes promotion idempotent worth having: a file using clearcoat AND sheen runs two
    // separate handlers over the same material, and the second must append rather than re-promote.
    const document = makeDocument(createStandardPbrMaterial() as unknown as MaterialLike);

    expect(attachGltfPbrExtension(document, 0, createClearcoatPbrExtension({ clearcoat: 1 }))).toBe(true);
    expect(attachGltfPbrExtension(document, 0, createSheenPbrExtension({ sheenRoughness: 0.5 }))).toBe(true);

    const extended = document.materials[0] as unknown as ExtendedPbrMaterial;
    expect(extended.extensions).toHaveLength(2);
    expect(extended.extensions[0].kind).toBe('ClearcoatPbrExtension');
    expect(extended.extensions[1].kind).toBe('SheenPbrExtension');
  });

  it('drops a duplicate extension kind rather than appending a second of the same', () => {
    const document = makeDocument(createStandardPbrMaterial() as unknown as MaterialLike);
    attachGltfPbrExtension(document, 0, createClearcoatPbrExtension({ clearcoat: 1 }));

    expect(attachGltfPbrExtension(document, 0, createClearcoatPbrExtension({ clearcoat: 0.5 }))).toBe(false);
    const extended = document.materials[0] as unknown as ExtendedPbrMaterial;
    expect(extended.extensions).toHaveLength(1);
    // The first descriptor stands; the duplicate did not overwrite it.
    expect((extended.extensions[0] as ClearcoatPbrExtension).clearcoat).toBe(1);
  });

  it('refuses a material index that does not exist', () => {
    const document = makeDocument(createStandardPbrMaterial() as unknown as MaterialLike);
    expect(attachGltfPbrExtension(document, 7, createClearcoatPbrExtension())).toBe(false);
  });

  it('leaves a non-metallic-roughness material alone', () => {
    // Only the standard lane has a block these extensions extend; converting anything else would discard
    // that material's own shading model.
    const foreign = { kind: 'UnlitMaterial' } as unknown as MaterialLike;
    const document = makeDocument(foreign);

    expect(attachGltfPbrExtension(document, 0, createClearcoatPbrExtension())).toBe(false);
    expect(document.materials[0].kind).toBe('UnlitMaterial');
  });

  it('leaves the standard material in place until an extension actually lands', () => {
    const document = makeDocument(createStandardPbrMaterial() as unknown as MaterialLike);
    expect(document.materials[0].kind).toBe(StandardPbrMaterialKind);
    expect((document.materials[0] as unknown as StandardPbrMaterial).roughness).toBeDefined();
  });
});
