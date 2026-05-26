import { createFont } from './font';

describe('createFont', () => {
  it('returns a font with the given name', () => {
    const font = createFont('Arial');
    expect(font.name).toBe('Arial');
  });

  it('returns a new object each call', () => {
    expect(createFont('Arial')).not.toBe(createFont('Arial'));
  });
});
