import { describe, expect, it } from 'vitest';

import { selectOrdinalCategory, selectPluralCategory } from './plural';

describe('selectOrdinalCategory', () => {
  it('distinguishes ordinal forms in en-US', () => {
    expect(selectOrdinalCategory(1, 'en-US')).toBe('one');
    expect(selectOrdinalCategory(2, 'en-US')).toBe('two');
    expect(selectOrdinalCategory(3, 'en-US')).toBe('few');
    expect(selectOrdinalCategory(4, 'en-US')).toBe('other');
  });
});

describe('selectPluralCategory', () => {
  it('distinguishes cardinal forms in en-US', () => {
    expect(selectPluralCategory(1, 'en-US')).toBe('one');
    expect(selectPluralCategory(2, 'en-US')).toBe('other');
  });
});
