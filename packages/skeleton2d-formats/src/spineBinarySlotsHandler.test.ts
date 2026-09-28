import { describe, expect, it } from 'vitest';

import {
  skipSpineBinarySlotsSection,
  spineBinarySlotsSectionHandler,
  spineBinarySlotsSectionReader,
} from './spineBinarySlotsHandler.ts';

describe('skipSpineBinarySlotsSection', () => {
  it('is the slots section skip function', () => {
    expect(skipSpineBinarySlotsSection).toBeTypeOf('function');
  });
});

describe('spineBinarySlotsSectionHandler', () => {
  it('is the slots section handler', () => {
    expect(spineBinarySlotsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineBinarySlotsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinarySlotsSectionReader).toBe(spineBinarySlotsSectionHandler);
  });
});
