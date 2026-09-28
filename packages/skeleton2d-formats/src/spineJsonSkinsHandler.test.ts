import { describe, expect, it } from 'vitest';

import { spineJsonSkinsSectionHandler, spineJsonSkinsSectionReader } from './spineJsonSkinsHandler.ts';

describe('spineJsonSkinsSectionHandler', () => {
  it('is the skins section handler', () => {
    expect(spineJsonSkinsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineJsonSkinsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonSkinsSectionReader).toBe(spineJsonSkinsSectionHandler);
  });
});
