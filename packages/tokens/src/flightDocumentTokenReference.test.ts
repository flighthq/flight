import {
  INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE,
  isFlightDocumentTokenReference,
  readFlightDocumentTokenReferenceKey,
  substituteFlightDocumentTokenValue,
} from './flightDocumentTokenReference';

describe('INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE', () => {
  it('is distinct from null, which a document may legitimately hold', () => {
    expect(INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE).not.toBeNull();
    expect(typeof INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE).toBe('symbol');
  });
});

describe('isFlightDocumentTokenReference', () => {
  it('accepts a sigil-prefixed scalar and rejects an escaped or ordinary one', () => {
    expect(isFlightDocumentTokenReference('$color.primary')).toBe(true);
    expect(isFlightDocumentTokenReference('$$5.00')).toBe(false);
    expect(isFlightDocumentTokenReference('color.primary')).toBe(false);
  });

  it('rejects every non-string value, including one that could carry a reference inside it', () => {
    expect(isFlightDocumentTokenReference(8)).toBe(false);
    expect(isFlightDocumentTokenReference(null)).toBe(false);
    expect(isFlightDocumentTokenReference(['$color.primary'])).toBe(false);
  });
});

describe('readFlightDocumentTokenReferenceKey', () => {
  it('reads a dotted key as one flat name rather than a path', () => {
    expect(readFlightDocumentTokenReferenceKey('$color.primary')).toBe('color.primary');
    expect(readFlightDocumentTokenReferenceKey('$acme.brand.primary')).toBe('acme.brand.primary');
  });

  it('refuses a key the codec would have had to quote', () => {
    expect(readFlightDocumentTokenReferenceKey('$9lives')).toBeNull();
    expect(readFlightDocumentTokenReferenceKey('$')).toBeNull();
    expect(readFlightDocumentTokenReferenceKey('$has space')).toBeNull();
  });
});

describe('substituteFlightDocumentTokenValue', () => {
  it('replaces references at every depth and leaves other scalars alone', () => {
    const value = substituteFlightDocumentTokenValue(
      { commands: [{ beginFill: { alpha: 1, color: '$color.primary' } }], name: 'card' },
      'fields',
      (key) => (key === 'color.primary' ? 0x3366ccff : INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE),
      fail,
    );
    expect(value).toEqual({ commands: [{ beginFill: { alpha: 1, color: 0x3366ccff } }], name: 'card' });
  });

  it('unescapes a doubled sigil without consulting the lookup', () => {
    expect(substituteFlightDocumentTokenValue('$$5.00', 'fields.text', fail as never, fail)).toBe('$5.00');
  });

  it('reports the path of a malformed reference and stops', () => {
    const paths: string[] = [];
    const value = substituteFlightDocumentTokenValue(
      { commands: [{ beginFill: { color: '$9lives' } }] },
      'fields',
      () => INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE,
      (path) => paths.push(path),
    );
    expect(value).toBe(INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE);
    expect(paths).toEqual(['fields.commands[0].beginFill.color']);
  });

  it('propagates a lookup refusal out of a nested array', () => {
    const value = substituteFlightDocumentTokenValue(
      [1, ['$color.absent']],
      'fields.ratios',
      () => INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE,
      fail,
    );
    expect(value).toBe(INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE);
  });

  it('returns a null scalar as a value rather than as a failure', () => {
    expect(substituteFlightDocumentTokenValue(null, 'fields.blendMode', fail as never, fail)).toBeNull();
  });
});

function fail(): never {
  throw new Error('the walker consulted a seam this case must never reach');
}
