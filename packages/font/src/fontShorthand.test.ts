import { getFontShorthand } from './fontShorthand';

describe('getFontShorthand', () => {
  it('quotes a plain family name at 1em', () => {
    expect(getFontShorthand('MyFont')).toBe("1em 'MyFont'");
  });

  it('backslash-escapes single quotes in the family name', () => {
    expect(getFontShorthand("Josh's Font")).toBe("1em 'Josh\\'s Font'");
  });

  it('backslash-escapes backslashes in the family name', () => {
    expect(getFontShorthand('Back\\slash')).toBe("1em 'Back\\\\slash'");
  });

  it('prefixes a style when provided', () => {
    expect(getFontShorthand('MyFont', 'italic')).toBe("italic 1em 'MyFont'");
  });

  it('omits the style prefix for an empty style string', () => {
    expect(getFontShorthand('MyFont', '')).toBe("1em 'MyFont'");
  });
});
