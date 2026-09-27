import type { SpritesheetData } from './SpritesheetData.ts';
import type { SpritesheetFormatKind } from './SpritesheetFormat.ts';
import type { SpritesheetParseOptions } from './SpritesheetParseOptions.ts';

/**
 * What one spritesheet format contributes: the test that recognises its text and the parser that reads it.
 *
 * Named here rather than repeated inline at each use, so a descriptor, the registrar and the registry all
 * describe the same shape instead of three structurally-identical copies of it.
 */
export interface SpritesheetFormatEntry {
  detect: (text: string) => boolean;
  parse: (text: string, options: SpritesheetParseOptions) => SpritesheetData;
}

/**
 * One spritesheet format as a single value: the kind it registers under and the entry that reads it.
 *
 * ★ A STABLE IDENTITY FOR ONE FORMAT, WHICH THE REGISTRY ALONE DOES NOT PROVIDE. The built-in entries were
 * constructed inside the registry's lazy initializer, so nothing outside the package could NAME one format — a
 * catalog row had nothing to point at, and a caller could not say "install these two" without rebuilding the
 * entries. Pairing the kind with the entry is what makes an ordered list of descriptors sufficient on its own.
 */
export interface SpritesheetFormatDescriptor {
  readonly entry: SpritesheetFormatEntry;
  readonly kind: SpritesheetFormatKind;
}

/**
 * Which spritesheet formats an import installs, in the order they are consulted.
 *
 * ★ ORDER IS LOAD-BEARING HERE, MEASURABLY. An Aseprite export carries `"app": "http://www.aseprite.org/"`,
 * which satisfies the TexturePacker detector as well as Aseprite's own — so Aseprite is chosen only because it
 * comes first. A caller who alphabetised this list would silently route every Aseprite file to the TexturePacker
 * parser: the wrong parser, not an error. The narrower detector must precede the broader one it overlaps with.
 *
 * Plain data: a list of descriptors and nothing else, so a generated manifest module can state it as a literal.
 * Applying it is a separate explicit step — nothing is registered by importing anything.
 *
 * Omitting `formats` installs nothing. The full preset is `spritesheetAllFormats`, which reproduces the built-in
 * registration in its own order.
 */
export interface SpritesheetImportOptions {
  readonly formats?: readonly Readonly<SpritesheetFormatDescriptor>[];
}
