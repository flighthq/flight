import { createFontSource } from './fontSource';

describe('createFontSource', () => {
  it('creates a FontSource with the given family name', () => {
    const source = createFontSource('Arial');
    expect(source.family).toBe('Arial');
  });

  it('initializes face to null', () => {
    const source = createFontSource('serif');
    expect(source.face).toBeNull();
  });

  it('returns a new object each call', () => {
    expect(createFontSource('Arial')).not.toBe(createFontSource('Arial'));
  });
});
