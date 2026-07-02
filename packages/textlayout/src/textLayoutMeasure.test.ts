import { measureText, setTextShaperBackend } from '@flighthq/textshaper';

import { getTextLayoutMeasureProvider, setTextLayoutMeasureProvider } from './textLayoutMeasure';

afterEach(() => {
  setTextLayoutMeasureProvider(null);
  setTextShaperBackend(null);
});

describe('getTextLayoutMeasureProvider', () => {
  it('returns null before a provider or shaper backend is set', () => {
    expect(getTextLayoutMeasureProvider()).toBeNull();
  });

  it('falls back to the textshaper seam when a backend is registered', () => {
    setTextShaperBackend({ measureText: (text) => text.length });
    expect(getTextLayoutMeasureProvider()).toBe(measureText);
  });

  it('prefers an explicitly set provider over the shaper backend', () => {
    const measure = (text: string) => text.length;
    setTextShaperBackend({ measureText: () => 99 });
    setTextLayoutMeasureProvider(measure);
    expect(getTextLayoutMeasureProvider()).toBe(measure);
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
