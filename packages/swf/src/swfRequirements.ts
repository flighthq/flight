import { createRequirementSet } from '@flighthq/requirement/contract';
import type {
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
  Requirement,
  RequirementSet,
} from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { collectSwfTagCounts, getSwfTagName } from './swfTagCensus';
import { SWF_NON_CONTENT_TAGS } from './swfTagVocabulary';

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
 *
 * KEYS ARE NAMESPACED BY FORMAT (`swf.DefineShape`). The `document.format` facet is shared by every
 * format Flight reads, and a bare block/tag name is not unique across them: AWD2 alone contributes
 * `Camera`, `Material`, `Texture` and `Light`, names a second 3D format will certainly reuse. Without
 * the namespace a catalog row written for one format would silently satisfy another format's identical
 * key. The separator is the dot the kind convention already uses for namespacing (`acme.Bloom`), not a
 * second spelling invented here.
 *
 * TAGS THAT NOTHING CAN SATISFY ARE NOT REQUIREMENTS. A requirement names something a build can supply
 * by registering an implementation, so two groups are excluded: tags carrying no scene content
 * (`SWF_NON_CONTENT_TAGS`, the same list the timeline walk skips) and tags the document walk consumes
 * structurally, which no registrable handler claims. Emitting them would put a permanently unresolvable
 * entry in every manifest — a warning on every build that no catalog row could ever answer, which
 * teaches a reader to ignore the channel that reports a genuinely missing handler. An UNRECOGNIZED tag
 * is still reported: that one is real, and is exactly what the channel is for.
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
      if (SWF_NON_CONTENT_TAGS.has(code) || SWF_STRUCTURAL_TAGS.has(code)) continue;
      requirements.push({
        facet: RequirementFacet.DocumentFormat,
        key: `${SWF_REQUIREMENT_KEY_NAMESPACE}.${getSwfTagName(code)}`,
      });
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}

/** The format namespace every SWF `document.format` requirement key carries. */
export const SWF_REQUIREMENT_KEY_NAMESPACE = 'swf';

// Tags the document/timeline walk consumes itself. `End` never reaches here — the census stops at it —
// and `ShowFrame` advances the frame cursor rather than defining content, so no handler claims either.
const SWF_STRUCTURAL_TAGS: ReadonlySet<number> = new Set([0, 1]);
