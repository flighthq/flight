import { EntityRuntimeKey, ShadedMaterialKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createEmissiveModifier } from './createEmissiveModifier';
import { createShadedMaterial, initializeShadedMaterial } from './createShadedMaterial';

describe('createShadedMaterial', () => {
  it('builds an entity with the ShadedMaterial kind', () => {
    const material = createShadedMaterial();
    expect(material.kind).toBe(ShadedMaterialKind);
    expect(EntityRuntimeKey in material).toBe(true);
  });

  it('defaults the lit base to white diffuse/specular, shininess 32, unit normal scale, no maps', () => {
    const material = createShadedMaterial();
    expect(material.diffuse).toBe(0xffffffff);
    expect(material.specular).toBe(0xffffffff);
    expect(material.shininess).toBe(32);
    expect(material.normalScale).toBe(1);
    expect(material.diffuseMap).toBeNull();
    expect(material.specularMap).toBeNull();
    expect(material.normalMap).toBeNull();
  });

  it('defaults the SurfaceMaterial trailer to opaque single-sided straight-alpha', () => {
    const material = createShadedMaterial();
    expect(material.alphaMode).toBe('opaque');
    expect(material.alphaCutoff).toBe(0.5);
    expect(material.doubleSided).toBe(false);
  });

  it('forwards the SurfaceMaterial trailer from options (mask/blend expressible at construction)', () => {
    const material = createShadedMaterial({ alphaCutoff: 0.25, alphaMode: 'mask', doubleSided: true });
    expect(material.alphaMode).toBe('mask');
    expect(material.alphaCutoff).toBe(0.25);
    expect(material.doubleSided).toBe(true);
  });

  it('defaults to an empty modifier stack', () => {
    const material = createShadedMaterial();
    expect(material.modifiers).toEqual([]);
  });

  it('applies provided base values and modifier stack', () => {
    const modifiers = [createEmissiveModifier({ color: 0xffaa00ff })];
    const material = createShadedMaterial({ diffuse: 0x102030ff, shininess: 8, modifiers });
    expect(material.diffuse).toBe(0x102030ff);
    expect(material.shininess).toBe(8);
    expect(material.modifiers).toBe(modifiers);
  });
});
describe('initializeShadedMaterial', () => {
  it('is the construction initializer of createShadedMaterial', () => {
    expect(typeof initializeShadedMaterial).toBe('function');
  });
});
