import type { HostTextShaperProvider, TextShaperOperation } from '@flighthq/types/contract';

import { explainTextShaperOperation, hasTextShaperOperation, measureText } from './textShaper';

describe('explainTextShaperOperation', () => {
  it('reports an operation the backend provides', () => {
    const operation = OPTIONAL_OPERATIONS[0];
    const backend = { ...partialBackend(), [operation]: () => undefined } as HostTextShaperProvider;
    expect(explainTextShaperOperation(backend, operation)).toEqual({
      implemented: true,
      layer: 'host',
      operation,
    });
  });

  it('reports none when the backend does not provide the operation', () => {
    for (const operation of OPTIONAL_OPERATIONS) {
      expect(explainTextShaperOperation(partialBackend(), operation)).toEqual({
        implemented: false,
        layer: 'none',
        operation,
      });
    }
  });
});

describe('hasTextShaperOperation', () => {
  it('agrees with explainTextShaperOperation for every optional operation', () => {
    const backend = partialBackend();
    for (const operation of OPTIONAL_OPERATIONS) {
      expect(hasTextShaperOperation(backend, operation)).toBe(
        explainTextShaperOperation(backend, operation).implemented,
      );
    }
  });
});

describe('measureText', () => {
  it('delegates to the backend', () => {
    const backend: HostTextShaperProvider = { measureText: (text) => text.length * 7 };
    expect(measureText(backend, 'abc', {})).toBe(21);
  });

  it('isolates callers that interleave different backends', () => {
    const first: HostTextShaperProvider = { measureText: () => 1 };
    const second: HostTextShaperProvider = { measureText: () => 2 };
    expect(measureText(first, 'x', {})).toBe(1);
    expect(measureText(second, 'x', {})).toBe(2);
    expect(measureText(first, 'x', {})).toBe(1);
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

// A host implementing only the REQUIRED members — partial support declared by absence.
function partialBackend(): HostTextShaperProvider {
  return {
    measureText: (() => undefined) as never,
  } as HostTextShaperProvider;
}
