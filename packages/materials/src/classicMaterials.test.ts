import { BlinnPhongMaterialKind, LambertMaterialKind, PhongMaterialKind } from '@flighthq/types';

import { createBlinnPhongMaterial, createLambertMaterial, createPhongMaterial } from './classicMaterials';

describe('createBlinnPhongMaterial', () => {
  it('creates a white Blinn-Phong material with a shininess of 32', () => {
    const material = createBlinnPhongMaterial();
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    expect(material.diffuse).toBe(0xffffffff);
    expect(material.specular).toBe(0xffffffff);
    expect(material.shininess).toBe(32);
    expect(material.normalMap).toBeNull();
  });

  it('applies overrides', () => {
    expect(createBlinnPhongMaterial({ shininess: 8 }).shininess).toBe(8);
  });
});

describe('createLambertMaterial', () => {
  it('creates a white diffuse material with no emission', () => {
    const material = createLambertMaterial();
    expect(material.kind).toBe(LambertMaterialKind);
    expect(material.diffuse).toBe(0xffffffff);
    expect(material.emissive).toBe(0x000000ff);
    expect(material.diffuseMap).toBeNull();
    expect(material.emissiveMap).toBeNull();
  });

  it('applies overrides', () => {
    expect(createLambertMaterial({ diffuse: 0xff0000ff }).diffuse).toBe(0xff0000ff);
  });
});

describe('createPhongMaterial', () => {
  it('creates a white Phong material with a shininess of 32', () => {
    const material = createPhongMaterial();
    expect(material.kind).toBe(PhongMaterialKind);
    expect(material.diffuse).toBe(0xffffffff);
    expect(material.specular).toBe(0xffffffff);
    expect(material.shininess).toBe(32);
    expect(material.normalScale).toBe(1);
  });

  it('applies overrides', () => {
    expect(createPhongMaterial({ specular: 0x808080ff }).specular).toBe(0x808080ff);
  });
});
