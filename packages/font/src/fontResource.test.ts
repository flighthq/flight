import { createFontResource, initializeFontResource } from './fontResource';

describe('createFontResource', () => {
  it('creates a FontResource with the given family name', () => {
    const resource = createFontResource('Arial');
    expect(resource.family).toBe('Arial');
  });

  it('initializes face to null', () => {
    const resource = createFontResource('serif');
    expect(resource.face).toBeNull();
  });

  it('returns a new object each call', () => {
    expect(createFontResource('Arial')).not.toBe(createFontResource('Arial'));
  });
});
describe('initializeFontResource', () => {
  it('is the construction initializer of createFontResource', () => {
    expect(typeof initializeFontResource).toBe('function');
  });
});
