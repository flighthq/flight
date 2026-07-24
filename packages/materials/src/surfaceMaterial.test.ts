import { BlendMode } from '@flighthq/types';

import {
  createSurfaceMaterial,
  getSurfaceMaterialAlphaMode,
  isSurfaceMaterialBlended,
  isSurfaceMaterialMasked,
  isSurfaceMaterialOpaque,
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

  it('forwards the shared trailer fields from opts', () => {
    const material = createSurfaceMaterial(TestSurfaceMaterialKind, {
      alphaCutoff: 0.25,
      alphaMode: 'mask',
      doubleSided: true,
    });
    expect(material.alphaMode).toBe('mask');
    expect(material.alphaCutoff).toBe(0.25);
    expect(material.doubleSided).toBe(true);
  });
});

describe('getSurfaceMaterialAlphaMode', () => {
  it('returns the alphaMode of the material', () => {
    const opaque = createSurfaceMaterial(TestSurfaceMaterialKind);
    expect(getSurfaceMaterialAlphaMode(opaque)).toBe('opaque');
    const blended = createSurfaceMaterial(TestSurfaceMaterialKind);
    blended.alphaMode = 'blend';
    expect(getSurfaceMaterialAlphaMode(blended)).toBe('blend');
    const masked = createSurfaceMaterial(TestSurfaceMaterialKind);
    masked.alphaMode = 'mask';
    expect(getSurfaceMaterialAlphaMode(masked)).toBe('mask');
  });
});

describe('isSurfaceMaterialBlended', () => {
  it('returns true only for blend mode', () => {
    const opaque = createSurfaceMaterial(TestSurfaceMaterialKind);
    expect(isSurfaceMaterialBlended(opaque)).toBe(false);
    const blended = createSurfaceMaterial(TestSurfaceMaterialKind);
    blended.alphaMode = 'blend';
    expect(isSurfaceMaterialBlended(blended)).toBe(true);
  });
});

describe('isSurfaceMaterialMasked', () => {
  it('returns true only for mask mode', () => {
    const opaque = createSurfaceMaterial(TestSurfaceMaterialKind);
    expect(isSurfaceMaterialMasked(opaque)).toBe(false);
    const masked = createSurfaceMaterial(TestSurfaceMaterialKind);
    masked.alphaMode = 'mask';
    expect(isSurfaceMaterialMasked(masked)).toBe(true);
  });
});

describe('isSurfaceMaterialOpaque', () => {
  it('returns true only for opaque mode', () => {
    const opaque = createSurfaceMaterial(TestSurfaceMaterialKind);
    expect(isSurfaceMaterialOpaque(opaque)).toBe(true);
    const blended = createSurfaceMaterial(TestSurfaceMaterialKind);
    blended.alphaMode = 'blend';
    expect(isSurfaceMaterialOpaque(blended)).toBe(false);
  });
});
