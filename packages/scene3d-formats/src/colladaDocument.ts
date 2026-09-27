import type { ColladaImportOptions, ColladaParseResult } from '@flighthq/types/contract';

import { colladaAllElementDecoders } from './colladaDecoderFamily.ts';
import { parseColladaWithDecoders } from './colladaParse.ts';

/**
 * Reads a COLLADA document, with every feature Flight supports unless the caller names fewer.
 *
 * ★ THIS MODULE EXISTS TO OWN THE DEFAULT, AND NOTHING ELSE. `parseColladaWithDecoders` does the work and takes the
 * family as an argument; resolving `undefined` to the full preset is the one thing that cannot live there, because
 * naming `colladaAllElementDecoders` from the orchestrator would put all six decoders — and the animation,
 * lighting, camera and mesh packages behind them — into the module graph of every caller, including the caller who
 * asked for geometry alone. Two modules, one of which is four lines, is what buys that.
 *
 * Behaviour is unchanged for every existing caller: `parseCollada(xml)` reads what it always read, in the order it
 * always read it, and `parseCollada(xml, { decoders })` narrows exactly as before.
 */
export function parseCollada(xml: string, options?: Readonly<ColladaImportOptions>): ColladaParseResult {
  return parseColladaWithDecoders(xml, options?.decoders ?? colladaAllElementDecoders, options);
}
