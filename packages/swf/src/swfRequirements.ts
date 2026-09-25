import { createRequirementSet } from '@flighthq/requirement/contract';
import type {
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
  Requirement,
  RequirementSet,
} from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { collectSwfContentCapabilities } from './swfContentCapabilities';
import { getSwfTagName } from './swfTagCensus';
import { SWF_NON_CONTENT_TAGS } from './swfTagVocabulary';

/**
 * Build-time inventory of what one SWF file asks a build to support.
 *
 * Emits requirements under multiple facets:
 *
 * - `document.format` — one per distinct tag the file contains (the parser handler each tag needs).
 * - `scene.blend-mode` — when any PlaceObject3/4 declares a blend mode.
 * - `scene.shape-command` — the shape drawing commands the content implies. Every SWF with DefineShape
 *   tags needs the core shape commands; bitmap character tags add texture fill commands.
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
 * key. The separator is the dot the kind convention already does for namespacing (`acme.Bloom`), not a
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
  const capabilities = collectSwfContentCapabilities(source, deflate, lzma);
  const requirements: Requirement[] = [];
  const facets: RequirementFacet[] = [RequirementFacet.DocumentFormat];
  if (capabilities !== null) {
    for (const code of capabilities.tagCounts.keys()) {
      if (SWF_NON_CONTENT_TAGS.has(code) || SWF_STRUCTURAL_TAGS.has(code)) continue;
      requirements.push({
        facet: RequirementFacet.DocumentFormat,
        key: `${SWF_REQUIREMENT_KEY_NAMESPACE}.${getSwfTagName(code)}`,
      });
    }

    const hasShapeTags = hasAnyTag(capabilities.tagCounts, SWF_SHAPE_TAGS);
    if (hasShapeTags || capabilities.usesBlendMode || capabilities.usesBitmapFills) {
      facets.push(RequirementFacet.SceneShapeCommand);
    }

    if (hasShapeTags) {
      for (const key of SWF_CORE_SHAPE_COMMANDS) {
        requirements.push({ facet: RequirementFacet.SceneShapeCommand, key });
      }
    }

    if (capabilities.usesBitmapFills) {
      for (const key of SWF_TEXTURE_SHAPE_COMMANDS) {
        requirements.push({ facet: RequirementFacet.SceneShapeCommand, key });
      }
    }

    if (capabilities.usesBlendMode) {
      facets.push(RequirementFacet.SceneBlendMode);
      requirements.push({ facet: RequirementFacet.SceneBlendMode, key: 'standard' });
    }
  }
  return createRequirementSet(facets, requirements);
}

/** The format namespace every SWF `document.format` requirement key carries. */
export const SWF_REQUIREMENT_KEY_NAMESPACE = 'swf';

// Tags the document/timeline walk consumes itself. `End` never reaches here — the census stops at it —
// and `ShowFrame` advances the frame cursor rather than defining content, so no handler claims either.
const SWF_STRUCTURAL_TAGS: ReadonlySet<number> = new Set([0, 1]);

const SWF_SHAPE_TAGS: ReadonlySet<number> = new Set([
  2, // DefineShape
  22, // DefineShape2
  32, // DefineShape3
  46, // DefineMorphShape
  83, // DefineShape4
  84, // DefineMorphShape2
]);

const SWF_CORE_SHAPE_COMMANDS: readonly string[] = [
  'beginFill',
  'beginGradientFill',
  'cubicCurveTo',
  'drawCircle',
  'drawEllipse',
  'drawPath',
  'drawRectangle',
  'drawRoundedRectangle',
  'endFill',
  'lineGradientStyle',
  'lineStyle',
  'lineTo',
  'moveTo',
  'quadraticCurveTo',
];

const SWF_TEXTURE_SHAPE_COMMANDS: readonly string[] = ['beginTextureFill', 'lineTextureStyle'];

function hasAnyTag(tagCounts: ReadonlyMap<number, number>, tags: ReadonlySet<number>): boolean {
  for (const code of tags) {
    if (tagCounts.has(code)) return true;
  }
  return false;
}
