import { StandardMaterialKind } from '@flighthq/types/contract';

import { createStandardMaterial, initializeStandardMaterial } from './standardMaterial';

describe('createStandardMaterial', () => {
  it('creates the authorable unlit textured material used by the default 2D pipeline', () => {
    const material = createStandardMaterial();

    expect(material.kind).toBe(StandardMaterialKind);
    expect(material.name).toBeNull();
  });

  it('preserves an authored name', () => {
    expect(createStandardMaterial({ name: 'ui' }).name).toBe('ui');
  });
});
describe('initializeStandardMaterial', () => {
  it('is the construction initializer of createStandardMaterial', () => {
    expect(typeof initializeStandardMaterial).toBe('function');
  });
});
