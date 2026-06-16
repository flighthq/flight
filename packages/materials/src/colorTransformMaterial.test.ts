import { ColorTransformMaterialKind, UniformColorTransformMaterialKind } from '@flighthq/types';

import { createColorTransform } from './colorTransform';
import { createColorTransformMaterial, createUniformColorTransformMaterial } from './colorTransformMaterial';

describe('createColorTransformMaterial', () => {
  it('creates a material with the per-instance color transform kind and no value', () => {
    const material = createColorTransformMaterial();
    expect(material.kind).toBe(ColorTransformMaterialKind);
    expect((material as { colorTransform?: unknown }).colorTransform).toBeUndefined();
  });
});

describe('createUniformColorTransformMaterial', () => {
  it('defaults to an identity color transform', () => {
    const material = createUniformColorTransformMaterial();
    expect(material.kind).toBe(UniformColorTransformMaterialKind);
    expect(material.colorTransform.redMultiplier).toBe(1);
  });

  it('carries the provided color transform', () => {
    const ct = createColorTransform({ greenMultiplier: 0.5 });
    const material = createUniformColorTransformMaterial(ct);
    expect(material.colorTransform).toBe(ct);
  });
});
