import { describe, expect, it } from 'vitest';

import { sourceContainsExpectedDescription } from '../tools/review/src/sourceExpectedDescription';

describe('sourceContainsExpectedDescription', () => {
  it('accepts the functional-target field form', () => {
    expect(
      sourceContainsExpectedDescription(`
        createFunctionalTarget({
          expectedImageDescription: 'a red square',
        });
      `),
    ).toBe(true);
  });

  it('accepts the call form used by effect-pipeline scenes', () => {
    expect(sourceContainsExpectedDescription(`declareExpectedImageDescription('a red square');`)).toBe(true);
  });

  it('does not mistake prose or unrelated identifiers for a declaration', () => {
    expect(
      sourceContainsExpectedDescription(`
        // expectedImageDescription and declareExpectedImageDescription are discussed here.
        const expectedImageDescriptionStatus = 'missing';
        createFunctionalTarget({ background: 0x000000ff });
      `),
    ).toBe(false);
  });
});
