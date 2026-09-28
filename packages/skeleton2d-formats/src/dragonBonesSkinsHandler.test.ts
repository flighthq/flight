import { describe, expect, it } from 'vitest';

import { dragonBonesSkinsSectionHandler, dragonBonesSkinsSectionReader } from './dragonBonesSkinsHandler.ts';

describe('dragonBonesSkinsSectionHandler', () => {
  it('is the skins section handler', () => {
    expect(dragonBonesSkinsSectionHandler).toBeTypeOf('function');
  });
});

describe('dragonBonesSkinsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(dragonBonesSkinsSectionReader).toBe(dragonBonesSkinsSectionHandler);
  });
});
