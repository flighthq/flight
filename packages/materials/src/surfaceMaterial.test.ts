import { BlendMode } from '@flighthq/types';

import {
  createSurfaceMaterial,
  getMaterialAlphaMode,
  isMaterialBlended,
  isMaterialMasked,
  isMaterialOpaque,
} from './surfaceMaterial';

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

describe('getMaterialAlphaMode', () => {
  it('returns the alphaMode of the material', () => {
    const opaque = createSurfaceMaterial(TestSurfaceMaterialKind);
    expect(getMaterialAlphaMode(opaque)).toBe('opaque');
    const blended = createSurfaceMaterial(TestSurfaceMaterialKind);
    blended.alphaMode = 'blend';
    expect(getMaterialAlphaMode(blended)).toBe('blend');
    const masked = createSurfaceMaterial(TestSurfaceMaterialKind);
    masked.alphaMode = 'mask';
    expect(getMaterialAlphaMode(masked)).toBe('mask');
  });
});

describe('isMaterialBlended', () => {
  it('returns true only for blend mode', () => {
    const opaque = createSurfaceMaterial(TestSurfaceMaterialKind);
    expect(isMaterialBlended(opaque)).toBe(false);
    const blended = createSurfaceMaterial(TestSurfaceMaterialKind);
    blended.alphaMode = 'blend';
    expect(isMaterialBlended(blended)).toBe(true);
  });
});

describe('isMaterialMasked', () => {
  it('returns true only for mask mode', () => {
    const opaque = createSurfaceMaterial(TestSurfaceMaterialKind);
    expect(isMaterialMasked(opaque)).toBe(false);
    const masked = createSurfaceMaterial(TestSurfaceMaterialKind);
    masked.alphaMode = 'mask';
    expect(isMaterialMasked(masked)).toBe(true);
  });
});

describe('isMaterialOpaque', () => {
  it('returns true only for opaque mode', () => {
    const opaque = createSurfaceMaterial(TestSurfaceMaterialKind);
    expect(isMaterialOpaque(opaque)).toBe(true);
    const blended = createSurfaceMaterial(TestSurfaceMaterialKind);
    blended.alphaMode = 'blend';
    expect(isMaterialOpaque(blended)).toBe(false);
  });
});
