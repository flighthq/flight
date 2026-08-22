import type { SpineBinaryVersionFailure } from '@flighthq/types/contract';

import {
  createSpineBinaryReader,
  isSpineBinaryReaderOverrun,
  readSpineBinaryString,
  skipSpineBinaryBytes,
} from './spineBinaryReader';

// The Spine `.skel` VERSION ACCESSOR — layer 1 of the version-keyed import model
// (agents/version-keyed-import-model.md). It reads the header and nothing else: no skeleton data, no
// record layout, no parser. That independence is the whole point. A probe implemented through one
// version's parser can only ever recognize that version, which is how a 3.8 file previously came back as
// `spine.binary-version-unsupported` carrying a GARBAGE version string instead of "3.8.55" — the reader
// had already misread the header before anyone asked what version it was.
//
// ★ TWO HEADER LAYOUTS, AND THE HASH IS WHAT MOVED. Spine changed the hash encoding between 3.x and 4.x:
//
//   v3.8:  [varint-prefixed ASCII string: base64 hash] [varint-prefixed string: version]
//   v4.x:  [8 raw binary bytes: truncated hash]        [varint-prefixed string: version]
//
// So each strategy reads the version from a different offset, and neither can be derived from the other.
// Both are tried, each independently validated, and a version is returned only when exactly one produces a
// version-shaped string. Verified against real 4.1.17 exports: the 4.x strategy reads "4.1.17" and the 3.x
// strategy returns null on the same bytes, because the raw hash contains non-printable bytes.

/**
 * Explains a `getSpineBinaryVersion` null, as plain data.
 *
 * Separately importable and never called by the accessor, so a caller who only needs the version pays
 * nothing for the diagnosis. It re-runs both strategies rather than caching state from a previous call: an
 * explanation that depended on a prior invocation would be wrong the moment it was asked about a different
 * file, and this way the two entry points cannot disagree.
 */
export function explainSpineBinaryVersionFailure(bytes: Readonly<Uint8Array>): SpineBinaryVersionFailure {
  const v3Candidate = _readSpineBinaryVersionV3(bytes);
  const v4Candidate = _readSpineBinaryVersionV4(bytes);
  const failure: SpineBinaryVersionFailure = {
    bytes: bytes.byteLength,
    reason: 'no-strategy-matched',
    v3Candidate,
    v4Candidate,
  };
  if (bytes.byteLength < SPINE_BINARY_MINIMUM_HEADER_BYTES) failure.reason = 'too-short';
  else if (v3Candidate !== null && v4Candidate !== null) failure.reason = 'strategies-disagree';
  return failure;
}

/**
 * The Spine version string a `.skel` file declares — `"4.1.17"`, `"3.8.55"` — or `null` when the header
 * cannot be read as either layout.
 *
 * Public-lane by intent: "is this file's version supported?" is a question an application loading arbitrary
 * `.skel` files asks, not internal wiring, and answering it costs only the varint/string primitives.
 */
export function getSpineBinaryVersion(bytes: Readonly<Uint8Array>): string | null {
  if (bytes.byteLength < SPINE_BINARY_MINIMUM_HEADER_BYTES) return null;
  const v3Candidate = _readSpineBinaryVersionV3(bytes);
  const v4Candidate = _readSpineBinaryVersionV4(bytes);
  // ★ EXACTLY ONE, NEVER A PREFERENCE ORDER. Returning "whichever matched first" would silently pick a
  // winner in the one case that means the discrimination has broken. On the corpus the strategies are
  // mutually exclusive, so an overlap is not a tie to resolve — it is a signal, and `explain*` reports it
  // as `strategies-disagree` rather than this function guessing.
  if (v3Candidate !== null && v4Candidate !== null) return null;
  return v3Candidate ?? v4Candidate;
}

// The 3.x header: a varint-prefixed ASCII base64 hash, then the varint-prefixed version. Rejects when the
// hash is not printable ASCII, which is what makes it decline every 4.x file — there the same bytes are a
// raw binary hash.
function _readSpineBinaryVersionV3(bytes: Readonly<Uint8Array>): string | null {
  const reader = createSpineBinaryReader(bytes);
  const hash = readSpineBinaryString(reader);
  if (isSpineBinaryReaderOverrun(reader) || hash === null || !_isPrintableAscii(hash)) return null;
  const version = readSpineBinaryString(reader);
  if (isSpineBinaryReaderOverrun(reader) || version === null) return null;
  return _isVersionShaped(version) ? version : null;
}

// The 4.x header: 8 raw hash bytes, then the varint-prefixed version. Declines a 3.8 file because the
// varint at offset 8 lands inside the base64 hash string, producing a length that yields a garbage string.
function _readSpineBinaryVersionV4(bytes: Readonly<Uint8Array>): string | null {
  const reader = createSpineBinaryReader(bytes);
  skipSpineBinaryBytes(reader, SPINE_BINARY_V4_HASH_BYTES);
  const version = readSpineBinaryString(reader);
  if (isSpineBinaryReaderOverrun(reader) || version === null) return null;
  return _isVersionShaped(version) ? version : null;
}

function _isPrintableAscii(value: string): boolean {
  if (value.length === 0) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

// `major.minor` with an optional patch. Deliberately anchored: a garbage decode that merely CONTAINS digits
// and dots must not read as a version, because the whole value of the probe is that a wrong header layout
// declines instead of producing a plausible string.
function _isVersionShaped(value: string): boolean {
  return SPINE_BINARY_VERSION_PATTERN.test(value);
}

// Eight raw bytes of truncated hash, ahead of the version string in every 4.x export.
const SPINE_BINARY_V4_HASH_BYTES = 8;

// Below this nothing can carry either header: 8 hash bytes plus a varint length plus one character.
const SPINE_BINARY_MINIMUM_HEADER_BYTES = 10;

const SPINE_BINARY_VERSION_PATTERN = /^\d+\.\d+(\.\d+)?$/;
