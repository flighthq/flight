import { parseAwd2Requirements } from '@flighthq/scene3d-formats/contract';
import { parseSwfRequirements } from '@flighthq/swf/contract';
import type { RequirementSet } from '@flighthq/types/contract';

/**
 * Reads one content file and reports what it requires.
 *
 * The plugin owns no format knowledge: an analyzer is a function the format package already exports,
 * and this signature is only the shape they share. A new format is added by registering its analyzer
 * here or by passing one in `analyzers`, never by teaching this package to read bytes.
 */
export type ContentAnalyzer = (source: Uint8Array) => RequirementSet;

/**
 * The formats Flight analyzes out of the box, keyed by lowercase file extension.
 *
 * These are the format packages' own exports called directly. Duplicating their logic here would let
 * a build's idea of what a file needs drift from what the importer actually reads — the two must be
 * the same walk or the manifest is a guess.
 */
export const DEFAULT_CONTENT_ANALYZERS: Readonly<Record<string, ContentAnalyzer>> = Object.freeze({
  '.awd': (source: Uint8Array) => parseAwd2Requirements(source, null, null),
  '.swf': (source: Uint8Array) => parseSwfRequirements(source, null, null),
});
