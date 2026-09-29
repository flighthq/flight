import { RequirementFacet } from '@flighthq/types/contract';
import type { RequirementDisposition } from '@flighthq/types/contract';

import { CATALOG_PARSER_BACKEND } from './catalog-rows.ts';

/**
 * The `document.format` features Flight reads DELIBERATELY WITHOUT A HANDLER, each with the reason.
 *
 * ★ WHY THIS IS A WRITTEN LIST AND NOT A DERIVATION. "Every analyzed feature that no handler claims" is
 * computable, and using it here would be the wrong thing: it maps a decision and an oversight to the same
 * answer. A feature nobody got round to writing a handler for would be declined as silently as one that is
 * structurally always read, and the diagnostic that would have reported the gap disappears with it. So each
 * entry is stated by a person with a reason, and `catalog-dispositions.test.ts` asserts this list equals the
 * unclaimed set exactly — which means a NEW unclaimed feature fails that gate until someone either writes a
 * handler or writes down why there is not one. Neither half can drift, and neither can absorb the other.
 *
 * Three reasons appear, and they are genuinely different situations:
 *   - read by another feature's handler, so a handler of its own would duplicate it;
 *   - read unconditionally by the core parse, so there is nothing for a caller to opt out of;
 *   - part of a format whose parser has no separable family at all.
 *
 * All three say "there is nothing to register". A feature Flight recognizes and deliberately does NOT implement says
 * something else, and belongs in `UNSUPPORTED_FORMAT_FEATURES` below.
 */
export const ALWAYS_READ_FORMAT_FEATURES: readonly { feature: string; namespace: string; reason: string }[] = [
  {
    feature: 'LightSpot',
    namespace: '3ds',
    reason:
      'read by threeDsLightHandler as part of the LIGHT chunk: the spot sub-chunk is what promotes a point light to a cone, not a separate feature to register',
  },
  {
    feature: 'MaterialBumpMap',
    namespace: '3ds',
    reason: 'read by threeDsMaterialHandler as part of the MATERIAL chunk',
  },
  {
    feature: 'MaterialOpacityMap',
    namespace: '3ds',
    reason: 'read by threeDsMaterialHandler as part of the MATERIAL chunk',
  },
  {
    feature: 'Mesh',
    namespace: 'gltf',
    reason:
      'the core parse always reads it: meshes, their accessors, and materials are what make the file a model, so there is nothing to opt out of',
  },
  {
    feature: 'Animation',
    namespace: 'md5',
    reason: 'the .md5anim parser reads one clip and has no separable family, so no subset of it can be named',
  },
  {
    feature: 'Hierarchy',
    namespace: 'md5',
    reason: 'the .md5anim parser reads one clip and has no separable family, so no subset of it can be named',
  },
  {
    feature: 'Mesh',
    namespace: 'md2',
    reason: 'MD2 is a single-mesh format; the mesh is the entire file content and cannot be omitted',
  },
  {
    feature: 'Mesh',
    namespace: 'md5',
    reason: 'MD5 mesh data is always present; the parser is bedrock',
  },
  {
    feature: 'Face',
    namespace: 'obj',
    reason: 'geometry faces are always present in OBJ; the parser is bedrock and has no separable face handler',
  },
  {
    feature: 'Line',
    namespace: 'obj',
    reason: 'read by the core parse as a sibling mesh topology, with no separable handler',
  },
  {
    feature: 'Point',
    namespace: 'obj',
    reason: 'read by the core parse as a sibling mesh topology, with no separable handler',
  },
  {
    feature: 'Mesh',
    namespace: 'stl',
    reason:
      'STL is a list of triangles and nothing else, so its parser has no separable family: there is no subset of the format a caller could decline and still be reading STL',
  },
];

/**
 * The backends a disposition has to be recorded for.
 *
 * ★ ONE PER BACKEND, BECAUSE SUPPRESSION IS PER BACKEND ON PURPOSE. `createRequirementCodegenPlan` matches a
 * disposition against the exact backend it is planning, so a decision recorded for canvas leaves the same
 * requirement in gl's `unresolved` — which is what keeps a real per-backend gap reportable. The consequence
 * is that an always-read feature needs the decision written for every backend that would otherwise report it,
 * and the manifest plugin plans all of these.
 */
const DISPOSITION_BACKENDS = ['canvas', 'dom', 'gl', 'wgpu', CATALOG_PARSER_BACKEND];

/**
 * The `document.format` features Flight RECOGNIZES BUT DELIBERATELY DOES NOT IMPLEMENT, each with the reason.
 *
 * ★ THIS IS A DIFFERENT STATEMENT FROM `ALWAYS_READ_FORMAT_FEATURES`, WHICH IS WHY IT IS A SECOND LIST. Every reason in
 * that one amounts to "there is nothing for a caller to register, because something else already reads it". These
 * features have no reader at all: the analyzer reports them because a document genuinely asks for them, and the import
 * carries none of it. Both kinds resolve a requirement without a parser option — a disposition is how the catalog says
 * "decided, do not report" — but collapsing them into one list would make "already covered" and "not built" the same
 * sentence, and a reader chasing a missing feature could not tell which they were looking at.
 *
 * The gate in `catalog-dispositions.test.ts` holds the line in both directions: a feature here that a handler DOES claim
 * fails, because a real row must never be shadowed by a decline, and the two lists must stay disjoint.
 */
export const UNSUPPORTED_FORMAT_FEATURES: readonly { feature: string; namespace: string; reason: string }[] = [
  {
    feature: 'Unknown(254)',
    namespace: 'awd2',
    reason: 'unrecognized AWD2 block type 254; no parser implementation exists',
  },
  {
    feature: 'Unknown(255)',
    namespace: 'awd2',
    reason: 'unrecognized AWD2 block type 255; no parser implementation exists',
  },
  {
    feature: 'mask.darken',
    namespace: 'lottie',
    reason:
      'Flight lowers a mask onto one hard ClipRegion, which composes by intersection only; a darken mask needs per-pixel compositing against the layer beneath it, so no handler reads it and a masked layer imports unmasked',
  },
  {
    feature: 'mask.difference',
    namespace: 'lottie',
    reason:
      'Flight lowers a mask onto one hard ClipRegion, which composes by intersection only; a difference mask needs per-pixel compositing against the layer beneath it, so no handler reads it and a masked layer imports unmasked',
  },
  {
    feature: 'mask.inverted',
    namespace: 'lottie',
    reason:
      'a ClipRegion keeps what its path covers and has no inverse, so an inverted mask would need the complement of its outline; the additive handler declines one and the layer imports unmasked, whatever its mode',
  },
  {
    feature: 'mask.intersect',
    namespace: 'lottie',
    reason:
      'a ClipRegion carries one path, so intersecting a second mask into it would need path booleans at import time; no handler reads the mode and a masked layer imports unmasked',
  },
  {
    feature: 'mask.lighten',
    namespace: 'lottie',
    reason:
      'Flight lowers a mask onto one hard ClipRegion, which composes by intersection only; a lighten mask needs per-pixel compositing against the layer beneath it, so no handler reads it and a masked layer imports unmasked',
  },
  {
    feature: 'mask.multiple',
    namespace: 'lottie',
    reason:
      'a ClipRegion carries one path, so a layer with several active masks would need them composed by path booleans first; the additive handler declines the layer rather than honouring one mask and dropping the rest',
  },
  {
    feature: 'mask.subtract',
    namespace: 'lottie',
    reason:
      'a ClipRegion keeps what its path covers and has no inverse, so subtracting a mask would need path booleans at import time; no handler reads the mode and a masked layer imports unmasked',
  },
];

/** Builds every built-in disposition, sorted so the generated source is byte-stable across runs. */
export function buildRequirementDispositions(): readonly RequirementDisposition[] {
  const dispositions: RequirementDisposition[] = [];
  for (const { feature, namespace, reason } of [...ALWAYS_READ_FORMAT_FEATURES, ...UNSUPPORTED_FORMAT_FEATURES]) {
    for (const backend of DISPOSITION_BACKENDS) {
      dispositions.push({ backend, facet: RequirementFacet.DocumentFormat, kind: `${namespace}.${feature}`, reason });
    }
  }
  return dispositions.sort((a, b) => a.kind.localeCompare(b.kind) || a.backend.localeCompare(b.backend));
}
