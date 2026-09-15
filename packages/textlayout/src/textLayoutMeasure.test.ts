import type { HostTextShaperProvider } from '@flighthq/types/contract';

import { getTextLayoutMeasureProvider, setTextLayoutMeasureProvider } from './textLayoutMeasure';

afterEach(() => {
  setTextLayoutMeasureProvider(null);
});

describe('getTextLayoutMeasureProvider', () => {
  it('returns null before a provider or host text shaper is supplied', () => {
    expect(getTextLayoutMeasureProvider()).toBeNull();
  });

  it('returns a bound measure function when a host text shaper is provided', () => {
    const backend: HostTextShaperProvider = { measureText: (text) => text.length };
    const measure = getTextLayoutMeasureProvider(backend);
    expect(measure).not.toBeNull();
    expect(measure!('abc', {})).toBe(3);
  });

  it('prefers an explicitly set provider over the host text shaper', () => {
    const explicit = (text: string) => text.length * 10;
    const backend: HostTextShaperProvider = { measureText: () => 99 };
    setTextLayoutMeasureProvider(explicit);
    expect(getTextLayoutMeasureProvider(backend)).toBe(explicit);
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
