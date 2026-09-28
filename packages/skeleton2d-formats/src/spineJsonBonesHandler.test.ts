import { describe, expect, it } from 'vitest';

import { spineJsonBonesSectionHandler, spineJsonBonesSectionReader } from './spineJsonBonesHandler.ts';

describe('spineJsonBonesSectionHandler', () => {
  it('is the bones section handler', () => {
    expect(spineJsonBonesSectionHandler).toBeTypeOf('function');
  });
});

describe('spineJsonBonesSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonBonesSectionReader).toBe(spineJsonBonesSectionHandler);
  });
});
