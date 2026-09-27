import type { TextureAtlas } from './TextureAtlas.ts';
import type { TextureAtlasFormatKind } from './TextureAtlasFormatKind.ts';
import type { TextureAtlasParseOptions } from './TextureAtlasParseOptions.ts';

/**
 * What one texture-atlas format contributes: the test that recognises its content and the parser that reads it.
 *
 * `parse` fills `atlas` and returns it, so the caller owns the allocation — the same ownership split the rest of
 * the texture-atlas API uses.
 */
export interface TextureAtlasFormatEntry {
  detect: (content: string) => boolean;
  parse: (content: string, atlas: TextureAtlas, options: TextureAtlasParseOptions) => TextureAtlas;
}

/**
 * One texture-atlas format as a single value: the kind it registers under and the entry that reads it.
 *
 * ★ A STABLE IDENTITY FOR ONE FORMAT, WHICH THE REGISTRY ALONE DOES NOT PROVIDE. The built-in entries were
 * constructed inside the registry's lazy initializer, so nothing outside the package could NAME one format — a
 * catalog row had nothing to point at, and a caller could not say "install these two" without rebuilding the
 * entries. Pairing the kind with the entry is what makes a list of descriptors sufficient on its own.
 */
export interface TextureAtlasFormatDescriptor {
  readonly entry: TextureAtlasFormatEntry;
  readonly kind: TextureAtlasFormatKind;
}

/**
 * Which texture-atlas formats an import installs.
 *
 * ★ ORDER IS NOT LOAD-BEARING HERE, AND THAT IS MEASURED, NOT ASSUMED. Every built-in detector answers only for
 * itself — the two JSON formats each run the whole `meta.app`/`duration` disambiguation — so no atlas document is
 * accepted by more than one, and `describe('textureAtlasAllFormats')` asserts that over the corpus in both
 * directions. A caller may reorder or subset this list freely. That is the opposite of the sibling
 * `SpritesheetImportOptions`, where Aseprite must precede TexturePacker.
 *
 * Plain data: a list of descriptors and nothing else, so a generated manifest module can state it as a literal.
 * Applying it is a separate explicit step — nothing is registered by importing anything.
 *
 * Omitting `formats` installs nothing. The full preset is `textureAtlasAllFormats`, which reproduces the built-in
 * registration.
 */
export interface TextureAtlasImportOptions {
  readonly formats?: readonly Readonly<TextureAtlasFormatDescriptor>[];
}
