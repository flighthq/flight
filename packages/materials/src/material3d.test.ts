import { BlendMode } from '@flighthq/types/contract';

import {
  createMaterial3D,
  getMaterial3DAlphaMode,
  isMaterial3DBlended,
  isMaterial3DMasked,
  isMaterial3DOpaque,
} from './material3d.ts';

const TestMaterial3DKind = 'TestMaterial3D';

describe('createMaterial3D', () => {
  it('carries the given kind', () => {
    expect(createMaterial3D(TestMaterial3DKind).kind).toBe(TestMaterial3DKind);
  });

  it('defaults the shared trailer to an opaque, single-sided surface', () => {
    const material = createMaterial3D(TestMaterial3DKind);
    expect(material.alphaMode).toBe('opaque');
    expect(material.alphaCutoff).toBe(0.5);
    expect(material.blendMode).toBe(BlendMode.Normal);
    expect(material.doubleSided).toBe(false);
  });

  it('forwards the shared trailer fields from opts', () => {
    const material = createMaterial3D(TestMaterial3DKind, {
      alphaCutoff: 0.25,
      alphaMode: 'mask',
      doubleSided: true,
    });
    expect(material.alphaMode).toBe('mask');
    expect(material.alphaCutoff).toBe(0.25);
    expect(material.doubleSided).toBe(true);
  });
});

describe('getMaterial3DAlphaMode', () => {
  it('returns the alphaMode of the material', () => {
    const opaque = createMaterial3D(TestMaterial3DKind);
    expect(getMaterial3DAlphaMode(opaque)).toBe('opaque');
    const blended = createMaterial3D(TestMaterial3DKind);
    blended.alphaMode = 'blend';
    expect(getMaterial3DAlphaMode(blended)).toBe('blend');
    const masked = createMaterial3D(TestMaterial3DKind);
    masked.alphaMode = 'mask';
    expect(getMaterial3DAlphaMode(masked)).toBe('mask');
  });
});

describe('isMaterial3DBlended', () => {
  it('returns true only for blend mode', () => {
    const opaque = createMaterial3D(TestMaterial3DKind);
    expect(isMaterial3DBlended(opaque)).toBe(false);
    const blended = createMaterial3D(TestMaterial3DKind);
    blended.alphaMode = 'blend';
    expect(isMaterial3DBlended(blended)).toBe(true);
  });
});

describe('isMaterial3DMasked', () => {
  it('returns true only for mask mode', () => {
    const opaque = createMaterial3D(TestMaterial3DKind);
    expect(isMaterial3DMasked(opaque)).toBe(false);
    const masked = createMaterial3D(TestMaterial3DKind);
    masked.alphaMode = 'mask';
    expect(isMaterial3DMasked(masked)).toBe(true);
  });
});

describe('isMaterial3DOpaque', () => {
  it('returns true only for opaque mode', () => {
    const opaque = createMaterial3D(TestMaterial3DKind);
    expect(isMaterial3DOpaque(opaque)).toBe(true);
    const blended = createMaterial3D(TestMaterial3DKind);
    blended.alphaMode = 'blend';
    expect(isMaterial3DOpaque(blended)).toBe(false);
  });
});
