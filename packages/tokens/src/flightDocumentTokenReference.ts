import type { FlightDocumentValue } from '@flighthq/types/contract';

// One statement of what a reference IS, shared by token-value resolution and node-field substitution.
// Two copies would drift, and the copy that drifted would be whichever a later change forgot — the
// same hazard the shape-command schema ruling names.
export function isFlightDocumentTokenReference(value: FlightDocumentValue): value is string {
  return typeof value === 'string' && value.startsWith(REFERENCE_SIGIL) && !value.startsWith(REFERENCE_ESCAPE);
}

// The token key a reference names, or null when the scalar is a malformed reference. A caller must
// have established that the value IS a reference; a plain string never reaches here.
export function readFlightDocumentTokenReferenceKey(value: string): string | null {
  const key = value.slice(REFERENCE_SIGIL.length);
  return FLIGHT_DOCUMENT_TOKEN_KEY_PATTERN.test(key) ? key : null;
}

// Walks a value tree and replaces every reference through `lookup`, which owns both the mapping from
// key to value and the refusal it records when there is none. Returns the sentinel rather than null
// because null is itself a representable document value, so it cannot mean failure here.
export function substituteFlightDocumentTokenValue(
  value: FlightDocumentValue,
  path: string,
  lookup: (key: string, path: string) => FlightDocumentValue | typeof INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE,
  refuseMalformed: (path: string) => void,
): FlightDocumentValue | typeof INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE {
  if (typeof value === 'string') {
    if (value.startsWith(REFERENCE_ESCAPE)) return value.slice(REFERENCE_SIGIL.length);
    if (!isFlightDocumentTokenReference(value)) return value;
    const key = readFlightDocumentTokenReferenceKey(value);
    if (key === null) {
      refuseMalformed(path);
      return INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE;
    }
    return lookup(key, path);
  }
  if (Array.isArray(value)) {
    const out: FlightDocumentValue[] = [];
    for (let index = 0; index < value.length; index++) {
      const item = substituteFlightDocumentTokenValue(value[index], `${path}[${index}]`, lookup, refuseMalformed);
      if (item === INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE) return item;
      out.push(item);
    }
    return out;
  }
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, FlightDocumentValue> = {};
  for (const key of Object.keys(value)) {
    const item = substituteFlightDocumentTokenValue(value[key], `${path}.${key}`, lookup, refuseMalformed);
    if (item === INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE) return item;
    out[key] = item;
  }
  return out;
}

// A reference that could not be resolved. Distinct from null, which a document may legitimately hold.
export const INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE = Symbol('invalid-flight-document-token-value');

// Token keys and mode names share the codec's plain-scalar shape, so an authored key never needs
// quoting and a reference never needs escaping beyond its sigil.
const FLIGHT_DOCUMENT_TOKEN_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const REFERENCE_ESCAPE = '$$';
const REFERENCE_SIGIL = '$';
