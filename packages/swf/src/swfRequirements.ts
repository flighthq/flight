import { createRequirementSet } from '@flighthq/requirement/contract';
import type {
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
  Requirement,
  RequirementSet,
} from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { collectSwfTagCounts, getSwfTagName } from './swfHeader';

/**
 * Build-time inventory of what one SWF file asks a build to support: one requirement per distinct tag
 * the file contains, under the `document.format` facet.
 *
 * It lives in this package because the tag vocabulary is SWF's own and this is where that vocabulary is
 * known. It depends on `@flighthq/requirement` — a two-dependency core package — so the direction stays
 * format -> core rather than core -> format. Keeping it here is also what lets the manifest tool stay a
 * thin CLI that understands no format at all.
 *
 * Build-time only: it walks every tag, so it is not something a running app should call. It is on the
 * contract lane rather than the public one so it cannot reach an application bundle.
 *
 * Keys are SWF's own tag names, because a requirement names content in the producer's vocabulary and
 * carries no registrar or backend identity — only a consumer maps a tag to an implementation. That is
 * also why an unregistered tag is reported exactly like a registered one. A tag code this build does
 * not name still produces a requirement under a stable `Unknown(n)` key: dropping an unrecognized tag
 * would silently shrink the inventory, which is the one failure this exists to prevent.
 *
 * Returns an empty set that still declares its coverage when the source is not a readable SWF, so a
 * caller can tell "inspected, found nothing" from "never looked".
 */
export function parseSwfRequirements(
  source: Uint8Array,
  deflate: Readonly<HostDecompressDeflateCapability> | null,
  lzma: Readonly<HostDecompressLzmaCapability> | null,
): RequirementSet {
  const counts = collectSwfTagCounts(source, deflate, lzma);
  const requirements: Requirement[] = [];
  if (counts !== null) {
    // Order is not chosen here: RequirementSet canonicalizes by facet then key, so a set is equal to
    // another with the same content regardless of the order a walk happened to observe it in.
    for (const code of counts.keys()) {
      requirements.push({ facet: RequirementFacet.DocumentFormat, key: getSwfTagName(code) });
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}
