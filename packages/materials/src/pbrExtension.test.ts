import { isValidPbrUvSet } from './pbrExtension';

describe('isValidPbrUvSet', () => {
  it('accepts the two canonical mesh UV channels only', () => {
    expect(isValidPbrUvSet(0)).toBe(true);
    expect(isValidPbrUvSet(1)).toBe(true);
    expect(isValidPbrUvSet(2)).toBe(false);
    expect(isValidPbrUvSet(NaN)).toBe(false);
  });
});
