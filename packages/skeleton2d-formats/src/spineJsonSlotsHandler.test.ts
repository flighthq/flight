import { describe, expect, it } from 'vitest';

import { spineJsonSlotsSectionHandler, spineJsonSlotsSectionReader } from './spineJsonSlotsHandler.ts';

describe('spineJsonSlotsSectionHandler', () => {
  it('is the slots section handler', () => {
    expect(spineJsonSlotsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineJsonSlotsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonSlotsSectionReader).toBe(spineJsonSlotsSectionHandler);
  });
});
