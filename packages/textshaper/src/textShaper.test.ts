import type { TextShaperBackend } from '@flighthq/types';

import { getTextShaperBackend, setTextShaperBackend, shapeText } from './textShaper';

afterEach(() => {
  setTextShaperBackend(null);
});

describe('getTextShaperBackend', () => {
  it('returns null before a backend is set', () => {
    expect(getTextShaperBackend()).toBeNull();
  });
});

describe('setTextShaperBackend', () => {
  it('stores the backend and clears it with null', () => {
    const backend: TextShaperBackend = { measureText: (text) => text.length };
    setTextShaperBackend(backend);
    expect(getTextShaperBackend()).toBe(backend);
    setTextShaperBackend(null);
    expect(getTextShaperBackend()).toBeNull();
  });

  it('replaces an existing backend (last write wins, no throw)', () => {
    const first: TextShaperBackend = { measureText: () => 1 };
    const second: TextShaperBackend = { measureText: () => 2 };
    setTextShaperBackend(first);
    setTextShaperBackend(second);
    expect(getTextShaperBackend()).toBe(second);
  });
});

describe('shapeText', () => {
  it('returns -1 when no backend is registered', () => {
    expect(shapeText('hello', {})).toBe(-1);
  });

  it('delegates to the active backend', () => {
    setTextShaperBackend({ measureText: (text) => text.length * 7 });
    expect(shapeText('abc', {})).toBe(21);
  });
});
