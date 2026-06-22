import type { HasMaterial } from '@flighthq/types';

import { initMaterialTrait } from './hasMaterial';
import { createNode } from './node';

const TestKind = 'Test';

function makeTarget(): HasMaterial {
  return createNode(TestKind) as unknown as HasMaterial;
}

describe('initMaterialTrait', () => {
  it('defaults material and materialData to null', () => {
    const target = makeTarget();
    initMaterialTrait(target);

    expect(target.material).toBeNull();
    expect(target.materialData).toBeNull();
  });

  it('applies material and materialData overrides', () => {
    const material = { kind: 'Mat' } as any;
    const materialData = {} as any;
    const target = makeTarget();
    initMaterialTrait(target, { material, materialData });

    expect(target.material).toBe(material);
    expect(target.materialData).toBe(materialData);
  });
});
