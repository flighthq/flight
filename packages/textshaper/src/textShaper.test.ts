import type { HasTextShaper, TextFormat, TextShaperBackend, TextShaperOperation } from '@flighthq/types/contract';

import {
  explainTextShaperOperation,
  getTextShaperBackend,
  hasTextShaperOperation,
  measureText,
  setTextShaperBackend,
} from './textShaper';

afterEach(() => {
  setTextShaperBackend(null);
});

describe('explainTextShaperOperation', () => {
  afterEach(() => {
    setTextShaperBackend(null);
  });

  // ★ With nothing installed, the getter returns null,
  // so a query resolving through the getter would report every operation implemented. It must not.
  it('reports none and no implementation when nothing is installed', () => {
    setTextShaperBackend(null);
    for (const operation of OPTIONAL_OPERATIONS) {
      expect(explainTextShaperOperation(operation)).toEqual({ implemented: false, layer: 'none', operation });
    }
  });

  it('reports a custom backend as implementing only what it provides', () => {
    setTextShaperBackend(partialBackend());
    for (const operation of OPTIONAL_OPERATIONS) {
      expect(hasTextShaperOperation(operation)).toBe(false);
    }
    expect(explainTextShaperOperation(OPTIONAL_OPERATIONS[0]).layer).toBe('none');
  });

  it('reports an operation the backend does provide', () => {
    const operation = OPTIONAL_OPERATIONS[0];
    setTextShaperBackend({ ...partialBackend(), [operation]: () => undefined } as TextShaperBackend);
    expect(explainTextShaperOperation(operation)).toEqual({ implemented: true, layer: 'custom', operation });
  });

  it('reports an explicitly supplied provider as the host layer', () => {
    const operation = OPTIONAL_OPERATIONS[0];
    const backend = { ...partialBackend(), [operation]: () => undefined } as TextShaperBackend;
    setTextShaperBackend(partialBackend());
    expect(explainTextShaperOperation(operation, shaperHost(backend))).toEqual({
      implemented: true,
      layer: 'host',
      operation,
    });
  });
});

describe('getTextShaperBackend', () => {
  it('returns an explicit host provider ahead of the legacy backend', () => {
    const legacy: TextShaperBackend = { measureText: () => 1 };
    const explicit: TextShaperBackend = { measureText: () => 2 };
    setTextShaperBackend(legacy);
    expect(getTextShaperBackend(shaperHost(explicit))).toBe(explicit);
  });

  it('returns null before a backend is set', () => {
    expect(getTextShaperBackend()).toBeNull();
  });
});

describe('hasTextShaperOperation', () => {
  afterEach(() => {
    setTextShaperBackend(null);
  });

  it('agrees with explainTextShaperOperation for every optional operation', () => {
    setTextShaperBackend(partialBackend());
    for (const operation of OPTIONAL_OPERATIONS) {
      expect(hasTextShaperOperation(operation)).toBe(explainTextShaperOperation(operation).implemented);
    }
  });
});

// Per-operation availability for TextShaperBackend. The operations below are the ones the interface declares
// OPTIONAL, so a host that omits them is compliant rather than broken — that is the absence-of-an-export
// ruling, and this is the query that makes it observable.
const OPTIONAL_OPERATIONS: readonly TextShaperOperation[] = [
  'getCodePointForGlyph',
  'getFontMetrics',
  'getGlyphExtents',
  'getGlyphIndexForCodePoint',
  'getGlyphName',
  'shapeRun',
];

describe('measureText', () => {
  it('accepts an optional explicit shaper host without breaking the existing signature', () => {
    expectTypeOf(measureText).toEqualTypeOf<
      (text: string, format: Readonly<TextFormat>, host?: HasTextShaper) => number
    >();
  });

  it('gives an explicit host precedence over the legacy installed backend', () => {
    setTextShaperBackend({ measureText: () => 99 });
    expect(measureText('abc', {}, shaperHost({ measureText: (text) => text.length }))).toBe(3);
  });

  it('isolates callers that interleave different explicit hosts', () => {
    const first = shaperHost({ measureText: () => 1 });
    const second = shaperHost({ measureText: () => 2 });
    expect(measureText('x', {}, first)).toBe(1);
    expect(measureText('x', {}, second)).toBe(2);
    expect(measureText('x', {}, first)).toBe(1);
  });

  it('returns -1 when no backend is registered', () => {
    expect(measureText('hello', {})).toBe(-1);
  });

  it('delegates to the active backend', () => {
    setTextShaperBackend({ measureText: (text) => text.length * 7 });
    expect(measureText('abc', {})).toBe(21);
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

// A host implementing only the REQUIRED members — partial support declared by absence.
function partialBackend(): TextShaperBackend {
  return {
    measureText: (() => undefined) as never,
  } as TextShaperBackend;
}

function shaperHost(shaper: TextShaperBackend): HasTextShaper {
  return { text: { shaper } };
}
