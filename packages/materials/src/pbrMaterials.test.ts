import { SpecularGlossinessPbrMaterialKind, StandardPbrMaterialKind } from '@flighthq/types';

import {
  createSpecularGlossinessPbrMaterial,
  createStandardPbrMaterial,
  createStandardPbrMaterialProperties,
} from './pbrMaterials';

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
