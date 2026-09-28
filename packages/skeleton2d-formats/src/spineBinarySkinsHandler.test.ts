import { describe, expect, it } from 'vitest';

import {
  skipSpineBinarySkinsSection,
  spineBinarySkinsSectionHandler,
  spineBinarySkinsSectionReader,
} from './spineBinarySkinsHandler.ts';

describe('skipSpineBinarySkinsSection', () => {
  it('is the skins section skip function', () => {
    expect(skipSpineBinarySkinsSection).toBeTypeOf('function');
  });
});

describe('spineBinarySkinsSectionHandler', () => {
  it('is the skins section handler', () => {
    expect(spineBinarySkinsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineBinarySkinsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinarySkinsSectionReader).toBe(spineBinarySkinsSectionHandler);
  });
});
