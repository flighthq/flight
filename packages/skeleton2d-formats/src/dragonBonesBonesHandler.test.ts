import { describe, expect, it } from 'vitest';

import { dragonBonesBonesSectionHandler, dragonBonesBonesSectionReader } from './dragonBonesBonesHandler.ts';

describe('dragonBonesBonesSectionHandler', () => {
  it('is the bones section handler', () => {
    expect(dragonBonesBonesSectionHandler).toBeTypeOf('function');
  });
});

describe('dragonBonesBonesSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(dragonBonesBonesSectionReader).toBe(dragonBonesBonesSectionHandler);
  });
});
