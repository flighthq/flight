import type { StandardPbrMaterial } from '@flighthq/types';
import { StandardPbrMaterialKind } from '@flighthq/types';

import { cloneMaterial, copyMaterial, createMaterial, equalsMaterial } from './material';
import { createStandardPbrMaterial } from './pbrMaterials';

const TestMaterialKind = 'TestMaterial';
const OtherMaterialKind = 'OtherMaterial';

describe('cloneMaterial', () => {
  it('returns a new object with the same kind', () => {
    const original = createMaterial(TestMaterialKind);
    const clone = cloneMaterial(original);
    expect(clone).not.toBe(original);
    expect(clone.kind).toBe(TestMaterialKind);
  });
  it('copies scalar fields from a standard PBR material', () => {
    const original = createStandardPbrMaterial({ metallic: 0.5, roughness: 0.25 });
    const clone = cloneMaterial(original);
    const clonePbr = clone as StandardPbrMaterial;
    expect(clonePbr.metallic).toBe(0.5);
    expect(clonePbr.roughness).toBe(0.25);
    expect(clone.kind).toBe(StandardPbrMaterialKind);
  });
  it('produces a clone that is structurally equal to the original', () => {
    const original = createStandardPbrMaterial({ metallic: 0.7 });
    const clone = cloneMaterial(original);
    expect(equalsMaterial(original, clone)).toBe(true);
  });
});

describe('copyMaterial', () => {
  it('copies scalar fields from source to out', () => {
    const source = createStandardPbrMaterial({ metallic: 0.3, roughness: 0.8 });
    const out = createStandardPbrMaterial();
    copyMaterial(out, source);
    const outPbr = out as StandardPbrMaterial;
    expect(outPbr.metallic).toBe(0.3);
    expect(outPbr.roughness).toBe(0.8);
  });
  it('is a no-op when out === source (alias-safe)', () => {
    const material = createStandardPbrMaterial({ metallic: 0.5 });
    copyMaterial(material, material);
    expect(material.metallic).toBe(0.5);
  });
});

describe('createMaterial', () => {
  it('creates a material carrying the given kind', () => {
    const material = createMaterial(TestMaterialKind);
    expect(material.kind).toBe(TestMaterialKind);
  });
});

describe('equalsMaterial', () => {
  it('is true for the same reference', () => {
    const material = createMaterial(TestMaterialKind);
    expect(equalsMaterial(material, material)).toBe(true);
  });

  it('is false for different kinds', () => {
    expect(equalsMaterial(createMaterial(TestMaterialKind), createMaterial(OtherMaterialKind))).toBe(false);
  });

  it('compares scalar fields of standard PBR materials structurally', () => {
    const a = createStandardPbrMaterial({ metallic: 0.5, roughness: 0.25 });
    const b = createStandardPbrMaterial({ metallic: 0.5, roughness: 0.25 });
    const c = createStandardPbrMaterial({ metallic: 0.5, roughness: 0.5 });
    expect(a.kind).toBe(StandardPbrMaterialKind);
    expect(equalsMaterial(a, b)).toBe(true);
    expect(equalsMaterial(a, c)).toBe(false);
  });

  it('treats same-kind materials without comparable fields as equal', () => {
    expect(equalsMaterial(createMaterial(TestMaterialKind), createMaterial(TestMaterialKind))).toBe(true);
  });
});
