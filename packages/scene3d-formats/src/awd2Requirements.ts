import { createRequirementSet } from '@flighthq/requirement/contract';
import type {
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
  Requirement,
  RequirementSet,
} from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { collectAwd2BlockCounts } from './awd2BlockCensus';

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
      requirements.push({ facet: RequirementFacet.DocumentFormat, key: name });
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}
