import { ColorTransformMaterialKind, UniformColorTransformMaterialKind } from '@flighthq/types';

import { createColorTransform } from './colorTransform';
import { createColorTransformMaterial, createUniformColorTransformMaterial } from './colorTransformMaterial';
import { createMaterial, equalsMaterial } from './material';

const TestMaterialKind: unique symbol = Symbol('TestMaterial');

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
    expect(equalsMaterial(createColorTransformMaterial(), createUniformColorTransformMaterial())).toBe(false);
  });

  it('compares the color transform of uniform color transform materials', () => {
    const a = createUniformColorTransformMaterial(createColorTransform({ redMultiplier: 0.5 }));
    const b = createUniformColorTransformMaterial(createColorTransform({ redMultiplier: 0.5 }));
    const c = createUniformColorTransformMaterial(createColorTransform({ redMultiplier: 0.25 }));
    expect(a.kind).toBe(UniformColorTransformMaterialKind);
    expect(equalsMaterial(a, b)).toBe(true);
    expect(equalsMaterial(a, c)).toBe(false);
  });

  it('treats same-kind materials without comparable fields as equal', () => {
    expect(equalsMaterial(createColorTransformMaterial(), createColorTransformMaterial())).toBe(true);
    expect(createColorTransformMaterial().kind).toBe(ColorTransformMaterialKind);
  });
});
