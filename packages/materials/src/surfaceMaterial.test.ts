import { BlendMode } from '@flighthq/types';

import { createSurfaceMaterial } from './surfaceMaterial';

const TestSurfaceMaterialKind = 'TestSurfaceMaterial';

describe('createSurfaceMaterial', () => {
  it('carries the given kind', () => {
    expect(createSurfaceMaterial(TestSurfaceMaterialKind).kind).toBe(TestSurfaceMaterialKind);
  });

  it('defaults the shared trailer to an opaque, single-sided surface', () => {
    const material = createSurfaceMaterial(TestSurfaceMaterialKind);
    expect(material.alphaMode).toBe('opaque');
    expect(material.alphaCutoff).toBe(0.5);
    expect(material.alphaType).toBe('straight');
    expect(material.blendMode).toBe(BlendMode.Normal);
    expect(material.doubleSided).toBe(false);
  });
});
