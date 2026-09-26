import type { ImportDiagnostic } from '@flighthq/types/contract';

import { parseRiveDocument } from './riveDocument.ts';

/**
 * How many objects of each core type a `.riv` file contains, keyed by the numeric type key.
 *
 * ★ REUSES THE BEDROCK READER RATHER THAN RE-DECODING THE WIRE. `parseRiveDocument` already walks the
 * container and the flat object stream, and a second walk written here would be a second thing to keep
 * correct — the format's property-width rules are exactly where a hand-rolled skimmer would go quietly wrong.
 * The cost is that the whole object stream is decoded rather than a prefix, which is the honest trade: Rive
 * gives no per-type index to read instead, and nothing in the container states its contents up front.
 *
 * ★ NULL AND EMPTY MEAN DIFFERENT THINGS, DELIBERATELY. `null` is a file this reader cannot traverse — a bad
 * signature, an unsupported major version, a truncated stream, a property key of unknown width. An EMPTY map
 * is a file that read cleanly and declares no objects. A caller that collapsed the two would ship a bundle
 * missing every implementation a corrupt-but-recoverable-looking file needed, which is the same hole the
 * other formats' readability probes exist to close.
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function collectRiveCoreTypeCounts(
  source: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): ReadonlyMap<number, number> | null {
  const document = parseRiveDocument(source, diagnostics);
  if (document === null) return null;

  const counts = new Map<number, number>();
  for (const object of document.objects) counts.set(object.typeKey, (counts.get(object.typeKey) ?? 0) + 1);
  return counts;
}

/**
 * Whether the bytes are a `.riv` this build can read at all.
 *
 * Separate from the census for the same reason every other format separates them: an analyzer reports an empty
 * requirement set both for a file that needs nothing and for one it could not decode, and a build that cannot
 * tell those apart ships a bundle missing every implementation the content needed.
 */
export function isReadableRive(source: Readonly<Uint8Array>): boolean {
  return parseRiveDocument(source) !== null;
}
