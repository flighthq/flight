import { decodeUTF8 } from '@flighthq/encoding/contract';
import type { StlFeatures } from '@flighthq/types/contract';

/** The one `document.format` feature STL has. Triangles are the whole format. */
export const STL_MESH_FEATURE = 'Mesh';

/**
 * Census of one STL file: which encoding it uses and how many triangles it carries, or `null` when the bytes are
 * not an STL at all or are truncated.
 *
 * ★ BINARY IS TESTED FIRST, AND BY EXACT PAYLOAD BOUNDS, BECAUSE THE OBVIOUS TEST IS WRONG. The format's own
 * documentation says an ASCII file begins with `solid`; it does NOT say a binary file's 80-byte header may not,
 * and exporters have written `solid` there for decades — some deliberately, to name the part. So "starts with
 * solid" tells a reader nothing. What a binary file cannot fake is its size: the layout is 80 header bytes, a
 * uint32 triangle count, and exactly 50 bytes per triangle, so `length === 84 + count * 50` is an equation an
 * arbitrary file satisfies only by coincidence. That equation is the discriminant, and it is why this returns a
 * count rather than a boolean — the count is what the check already had to read.
 *
 * A file that is binary-shaped but short by even one byte is TRUNCATED, not ASCII, and is reported `null`. Trying
 * the ASCII grammar on it would read a partial facet list and report a smaller model, which is the failure mode
 * this whole function exists to prevent: a wrong answer that looks like a right one.
 *
 * A count of zero is rejected. The bounds equation degenerates at `count === 0` to "the file is exactly 84 bytes",
 * which any 84-byte file with four zero bytes at offset 80 satisfies — so accepting it would trade a file that
 * carries no geometry for a class of false positives. An empty STL and a non-STL are both `null` here, and both
 * yield nothing to import.
 *
 * ASCII is then checked against the facet grammar itself rather than against its opening keyword, for the mirror
 * reason: `solid` is the cheap half of the format and the facet block is the half that means something.
 */
export function collectStlFeatures(bytes: Readonly<Uint8Array>): StlFeatures | null {
  const binaryCount = readBinaryStlTriangleCount(bytes);
  if (binaryCount !== null) return { triangleCount: binaryCount, variant: 'Binary' };
  // The opening keyword is checked on a short prefix before the file is decoded. It is a weak test on its own —
  // which is the whole point of the grammar check below — but it is enough to avoid decoding every megabyte of
  // every non-STL asset in a build to discover it does not begin with `solid`.
  if (!startsWithAsciiSolid(bytes)) return null;
  const asciiCount = countAsciiStlFacets(decodeUTF8(bytes));
  return asciiCount === null ? null : { triangleCount: asciiCount, variant: 'Ascii' };
}

/**
 * Counts the facets of an ASCII STL, or `null` when the text is not one.
 *
 * ★ STRICT ON PURPOSE, AND THE STRICTNESS IS THE DETECTOR. `.stl` is not a shared extension today, but this
 * grammar is what stands between "an STL" and "any text file with the word solid in it" — and the manifest
 * plugin asks the question of every candidate asset. So a facet must be complete: a normal, an `outer loop`,
 * EXACTLY three vertices, an `endloop` and an `endfacet`. A file with one malformed facet is rejected whole
 * rather than silently reported as the facets that happened to parse.
 *
 * Numbers are validated here too. `facet normal a b c` with a non-numeric field is not a facet, and neither is a
 * vertex line with two coordinates — both are the signature of a file that is something else, or of one that is
 * damaged, and either way a triangle count derived from it would be fiction.
 */
export function countAsciiStlFacets(text: string): number | null {
  const tokens = readAsciiStlBodyTokens(text);
  if (tokens === null) return null;

  let index = 0;
  let facets = 0;
  while (index < tokens.length) {
    const keyword = tokens[index].toLowerCase();
    if (keyword === 'endsolid') break;
    if (keyword !== 'facet') return null;
    if (tokens[index + 1]?.toLowerCase() !== 'normal') return null;
    if (!areFiniteNumbers(tokens, index + 2, 3)) return null;
    if (tokens[index + 5]?.toLowerCase() !== 'outer' || tokens[index + 6]?.toLowerCase() !== 'loop') return null;
    let cursor = index + 7;
    for (let vertex = 0; vertex < 3; vertex++) {
      if (tokens[cursor]?.toLowerCase() !== 'vertex') return null;
      if (!areFiniteNumbers(tokens, cursor + 1, 3)) return null;
      cursor += 4;
    }
    if (tokens[cursor]?.toLowerCase() !== 'endloop') return null;
    if (tokens[cursor + 1]?.toLowerCase() !== 'endfacet') return null;
    facets++;
    index = cursor + 2;
  }
  return facets === 0 ? null : facets;
}

/**
 * The triangle count of a binary STL, or `null` when the bytes are not one.
 *
 * Exported because `parseStl` asks the same question and must get the same answer: two readings of the same
 * bounds equation are two chances to disagree about whether a file is binary.
 */
export function readBinaryStlTriangleCount(bytes: Readonly<Uint8Array>): number | null {
  if (bytes.length < BINARY_STL_HEADER_SIZE) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(BINARY_STL_COUNT_OFFSET, true);
  if (count === 0) return null;
  return bytes.length === BINARY_STL_HEADER_SIZE + count * BINARY_STL_TRIANGLE_SIZE ? count : null;
}

/** 80 header bytes plus the uint32 triangle count: everything before the first triangle. */
export const BINARY_STL_HEADER_SIZE = 84;

/** Where the uint32 little-endian triangle count sits, immediately after the 80-byte header. */
export const BINARY_STL_COUNT_OFFSET = 80;

/** One binary triangle: 4 vectors of 3 float32 (normal + 3 vertices) plus a uint16 attribute word. */
export const BINARY_STL_TRIANGLE_SIZE = 50;

// Enough to hold any leading whitespace plus the opening keyword. A file whose first non-space token starts
// further in than this is not something any STL writer produces.
const ASCII_STL_PREFIX_BYTES = 64;

// Whether `count` consecutive tokens starting at `start` are all finite numbers. A coordinate that is NaN or
// Infinity is not a coordinate; accepting one would put a non-finite float into a vertex buffer, where it
// silently poisons every bound and every normal derived from it.
function areFiniteNumbers(tokens: readonly string[], start: number, count: number): boolean {
  for (let index = start; index < start + count; index++) {
    const token = tokens[index];
    if (token === undefined) return false;
    const value = Number(token);
    if (!Number.isFinite(value)) return false;
  }
  return true;
}

/**
 * The tokens of an ASCII STL after its `solid` line, or `null` when the text does not open one.
 *
 * ★ THE SOLID NAME RUNS TO END OF LINE, WHICH IS WHY THIS SPLITS ON THE FIRST NEWLINE RATHER THAN SKIPPING
 * TOKENS. Scanning forward for the first `facet` keyword instead would accept anything at all between the header
 * and the first facet — the exact looseness the grammar check exists to remove — and would also mis-skip a part
 * named with the word `facet` in it.
 */
function readAsciiStlBodyTokens(text: string): readonly string[] | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const firstBreak = trimmed.search(/[\r\n]/);
  const header = (firstBreak < 0 ? trimmed : trimmed.slice(0, firstBreak)).trim();
  if (header.split(/\s+/)[0].toLowerCase() !== 'solid') return null;
  if (firstBreak < 0) return [];
  const body = trimmed.slice(firstBreak).trim();
  return body === '' ? [] : body.split(/\s+/);
}

// Whether the bytes open with the `solid` keyword, read from a prefix rather than from the whole file. Leading
// whitespace is skipped the way the grammar does; anything else answers false.
function startsWithAsciiSolid(bytes: Readonly<Uint8Array>): boolean {
  const head = decodeUTF8(bytes, 0, Math.min(bytes.length, ASCII_STL_PREFIX_BYTES)).trimStart();
  return head.slice(0, 5).toLowerCase() === 'solid';
}
