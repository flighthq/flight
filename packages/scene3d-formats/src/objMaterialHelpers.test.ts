import type { Scene3DDocument } from '@flighthq/types/contract';

import { clampChannel, externalObjTexture, packObjColor } from './objMaterialHelpers.ts';

function emptyDocument(): Scene3DDocument {
  return { materials: [], meshes: [], nodes: [], resources: [], scenes: [{ rootNodes: [] }] };
}

describe('clampChannel', () => {
  it('is a function', () => {
    expect(typeof clampChannel).toBe('function');
  });

  it('maps 0 to 0', () => {
    expect(clampChannel(0)).toBe(0);
  });

  it('maps 1 to 255', () => {
    expect(clampChannel(1)).toBe(0xff);
  });

  it('maps 0.5 to 128', () => {
    expect(clampChannel(0.5)).toBe(128);
  });

  it('clamps negative values to 0', () => {
    expect(clampChannel(-0.5)).toBe(0);
  });

  it('clamps values above 1 to 255', () => {
    expect(clampChannel(1.5)).toBe(0xff);
  });
});

describe('externalObjTexture', () => {
  it('is a function', () => {
    expect(typeof externalObjTexture).toBe('function');
  });

  it('returns null for a null uri', () => {
    expect(externalObjTexture(null, emptyDocument(), 'srgb')).toBeNull();
  });

  it('returns a texture for a non-null uri', () => {
    const result = externalObjTexture('diffuse.png', emptyDocument(), 'srgb');
    expect(result).not.toBeNull();
    expect(result!.colorSpace).toBe('srgb');
  });
});

describe('packObjColor', () => {
  it('is a function', () => {
    expect(typeof packObjColor).toBe('function');
  });

  it('packs white opaque as 0xffffffff', () => {
    expect(packObjColor([1, 1, 1], 1)).toBe(0xffffffff);
  });

  it('packs black transparent as 0x00000000', () => {
    expect(packObjColor([0, 0, 0], 0)).toBe(0x00000000);
  });

  it('packs red opaque as 0xff0000ff', () => {
    expect(packObjColor([1, 0, 0], 1)).toBe(0xff0000ff);
  });
});
