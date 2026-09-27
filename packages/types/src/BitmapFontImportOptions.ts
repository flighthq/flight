import type { BitmapFont } from './BitmapFont.ts';
import type { BitmapFontParseOptions } from './BitmapFont.ts';
import type { BitmapFontFormatKind } from './BitmapFontFormatKind.ts';
import type { ImportDiagnostic } from './ImportDiagnostic.ts';

/**
 * What one bitmap font format contributes: the test that recognises its bytes and the parser that reads them.
 *
 * ★ BYTES, NOT TEXT, AND THAT IS THE ONLY HONEST UNIFICATION. One of the four built-in formats is binary and
 * three are text, so a `string` entry could not describe the family and a caller would have to know which
 * front end to reach for before knowing which format it holds. A font on disk is bytes; the text front ends
 * decode. Decoding is the entry's business, so nothing above it has to guess an encoding.
 */
export interface BitmapFontFormatEntry {
  detect: (bytes: Readonly<Uint8Array>) => boolean;
  parse: (
    bytes: Readonly<Uint8Array>,
    options?: Readonly<BitmapFontParseOptions>,
    diagnostics?: ImportDiagnostic[],
  ) => BitmapFont | null;
}

/**
 * One bitmap font format as a single value: the kind it registers under and the entry that reads it.
 *
 * A stable identity for one format, which the registry alone does not provide: a catalog row needs something to
 * point at, and a caller wanting a subset needs to be able to name two formats without rebuilding their entries.
 */
export interface BitmapFontFormatDescriptor {
  readonly entry: BitmapFontFormatEntry;
  readonly kind: BitmapFontFormatKind;
}

/**
 * Which bitmap font formats an import installs.
 *
 * ★ ORDER IS NOT LOAD-BEARING. Every built-in detector asks ONE shared discrimination
 * (`readBitmapFontFormatKind`) and answers only for its own kind, so no font file is accepted by two; that is
 * measured by reversing the preset, not asserted. A caller may reorder or subset this list.
 *
 * Plain data: a list of descriptors and nothing else, so a generated manifest module can state it as a literal.
 * Applying it is a separate explicit step — nothing is registered by importing anything.
 *
 * Omitting `formats` installs nothing. The full preset is `bitmapFontAllFormats`.
 */
export interface BitmapFontImportOptions {
  readonly formats?: readonly Readonly<BitmapFontFormatDescriptor>[];
}
