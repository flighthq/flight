import type { Texture } from '@flighthq/types';
import { SpecularGlossinessPbrMaterialKind, StandardPbrMaterialKind } from '@flighthq/types';

import {
  convertSpecularGlossinessToStandardPbr,
  createSpecularGlossinessPbrMaterial,
  createStandardPbrMaterial,
  createStandardPbrMaterialProperties,
} from './pbrMaterials';

describe('convertSpecularGlossinessToStandardPbr', () => {
  it('maps glossiness to roughness as 1 - glossiness', () => {
    const source = createSpecularGlossinessPbrMaterial({ glossiness: 0.75 });
    const out = createStandardPbrMaterialProperties();
    convertSpecularGlossinessToStandardPbr(out, source);
    expect(out.roughness).toBeCloseTo(0.25, 5);
  });
  it('produces metallic=0 for a dielectric (black specular)', () => {
    const source = createSpecularGlossinessPbrMaterial({ specular: 0x000000ff });
    const out = createStandardPbrMaterialProperties();
    convertSpecularGlossinessToStandardPbr(out, source);
    expect(out.metallic).toBe(0);
  });
  it('produces metallic=1 for a full metallic (white specular, white diffuse)', () => {
    const source = createSpecularGlossinessPbrMaterial({ specular: 0xffffffff, diffuse: 0xffffffff });
    const out = createStandardPbrMaterialProperties();
    convertSpecularGlossinessToStandardPbr(out, source);
    expect(out.metallic).toBeCloseTo(1, 1);
  });
  it('forwards emissive, normalMap, and occlusionMap unchanged', () => {
    const source = createSpecularGlossinessPbrMaterial({ emissive: 0xff000000, emissiveStrength: 2.5 });
    const out = createStandardPbrMaterialProperties();
    convertSpecularGlossinessToStandardPbr(out, source);
    expect(out.emissive).toBe(0xff000000);
    expect(out.emissiveStrength).toBe(2.5);
  });
  it('does not reinterpret a packed specular-glossiness map as metallic-roughness', () => {
    const packedMap = {} as Texture;
    const previousMap = {} as Texture;
    const source = createSpecularGlossinessPbrMaterial({ specularGlossinessMap: packedMap });
    const out = createStandardPbrMaterialProperties({ metallicRoughnessMap: previousMap });

    convertSpecularGlossinessToStandardPbr(out, source);

    expect(out.metallicRoughnessMap).toBeNull();
    expect(source.specularGlossinessMap).toBe(packedMap);
  });
  it('is alias-safe when out is used as a different object from source', () => {
    const source = createSpecularGlossinessPbrMaterial({ glossiness: 0.5, diffuse: 0xff0000ff });
    const out = createStandardPbrMaterialProperties();
    convertSpecularGlossinessToStandardPbr(out, source);
    // glossiness=0.5 → roughness=0.5
    expect(out.roughness).toBeCloseTo(0.5, 5);
  });
});

describe('createSpecularGlossinessPbrMaterial', () => {
  it('creates a white spec-gloss material at full glossiness', () => {
    const material = createSpecularGlossinessPbrMaterial();
    expect(material.kind).toBe(SpecularGlossinessPbrMaterialKind);
    expect(material.diffuse).toBe(0xffffffff);
    expect(material.specular).toBe(0xffffffff);
    expect(material.glossiness).toBe(1);
    expect(material.specularGlossinessMap).toBeNull();
  });

  it('applies overrides', () => {
    expect(createSpecularGlossinessPbrMaterial({ glossiness: 0.25 }).glossiness).toBe(0.25);
  });
});

describe('createStandardPbrMaterial', () => {
  it('creates a white, dielectric, fully-rough material', () => {
    const material = createStandardPbrMaterial();
    expect(material.kind).toBe(StandardPbrMaterialKind);
    expect(material.baseColor).toBe(0xffffffff);
    expect(material.metallic).toBe(0);
    expect(material.roughness).toBe(1);
    expect(material.emissive).toBe(0x000000ff);
    expect(material.baseColorMap).toBeNull();
  });

  it('applies overrides', () => {
    const material = createStandardPbrMaterial({ metallic: 1, roughness: 0.2 });
    expect(material.metallic).toBe(1);
    expect(material.roughness).toBe(0.2);
  });
});

describe('createStandardPbrMaterialProperties', () => {
  it('creates the property block with no kind or trailer', () => {
    const properties = createStandardPbrMaterialProperties();
    expect(properties.baseColor).toBe(0xffffffff);
    expect(properties.metallic).toBe(0);
    expect(properties.roughness).toBe(1);
    expect((properties as { kind?: unknown }).kind).toBeUndefined();
    expect((properties as { alphaMode?: unknown }).alphaMode).toBeUndefined();
  });

  it('applies overrides', () => {
    expect(createStandardPbrMaterialProperties({ roughness: 0.5 }).roughness).toBe(0.5);
  });
});
