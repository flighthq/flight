import { describe, expect, it } from 'vitest';

import { dragonBonesSlotsSectionHandler, dragonBonesSlotsSectionReader } from './dragonBonesSlotsHandler.ts';

describe('dragonBonesSlotsSectionHandler', () => {
  it('is the slots section handler', () => {
    expect(dragonBonesSlotsSectionHandler).toBeTypeOf('function');
  });
});

describe('dragonBonesSlotsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(dragonBonesSlotsSectionReader).toBe(dragonBonesSlotsSectionHandler);
  });
});
