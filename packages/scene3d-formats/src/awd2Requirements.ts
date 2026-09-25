import { createRequirementSet } from '@flighthq/requirement/contract';
import type {
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
  Requirement,
  RequirementSet,
} from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { collectAwd2BlockCounts } from './awd2BlockCensus.ts';

/**
 * Build-time inventory of what one AWD2 file asks a build to support: one requirement per distinct
 * block type the file contains, under the `document.format` facet.
 *
 * The AWD2 counterpart of `parseSwfRequirements`, with the same shape and the same reasoning. It lives
 * in this package because the block vocabulary is AWD2's own, and it depends on `@flighthq/requirement`
 * so the direction stays format -> core.
 *
 * Build-time only: it walks every block header, so it is on the contract lane and cannot reach an
 * application bundle.
 *
 * Keys are AWD2's own block names, carrying no handler or registrar identity — only a consumer maps a
 * block type to an implementation, which is why a block no handler claims is reported exactly like one
 * that is. A block type this build does not name still produces a requirement under a stable label,
 * because an unrecognized block is precisely what an inventory exists to surface.
 *
 * KEYS ARE NAMESPACED BY FORMAT (`awd2.Camera`). The `document.format` facet is shared by every
 * format Flight reads, and a bare block/tag name is not unique across them: AWD2 alone contributes
 * `Camera`, `Material`, `Texture` and `Light`, names a second 3D format will certainly reuse. Without
 * the namespace a catalog row written for one format would silently satisfy another format's identical
 * key. The separator is the dot the kind convention already uses for namespacing (`acme.Bloom`), not a
 * second spelling invented here.
 */
export function parseAwd2Requirements(
  source: Uint8Array,
  deflate: Readonly<HostDecompressDeflateCapability> | null,
  lzma: Readonly<HostDecompressLzmaCapability> | null,
): RequirementSet {
  const counts = collectAwd2BlockCounts(source, deflate, lzma);
  const requirements: Requirement[] = [];
  if (counts !== null) {
    // RequirementSet canonicalizes by facet then key, so the walk order here is not an ordering claim.
    for (const name of counts.keys()) {
      requirements.push({
        facet: RequirementFacet.DocumentFormat,
        key: `${AWD2_REQUIREMENT_KEY_NAMESPACE}.${name}`,
      });
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}

/** The format namespace every AWD2 `document.format` requirement key carries. */
export const AWD2_REQUIREMENT_KEY_NAMESPACE = 'awd2';
