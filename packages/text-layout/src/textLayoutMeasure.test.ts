import { getTextLayoutMeasureProvider, setTextLayoutMeasureProvider } from './textLayoutMeasure';

afterEach(() => {
  setTextLayoutMeasureProvider(null);
});

describe('getTextLayoutMeasureProvider', () => {
  it('returns null before a provider is set', () => {
    expect(getTextLayoutMeasureProvider()).toBeNull();
  });
});

describe('setTextLayoutMeasureProvider', () => {
  it('stores the provider and clears it with null', () => {
    const measure = (text: string) => text.length;
    setTextLayoutMeasureProvider(measure);
    expect(getTextLayoutMeasureProvider()).toBe(measure);
    setTextLayoutMeasureProvider(null);
    expect(getTextLayoutMeasureProvider()).toBeNull();
  });
});
