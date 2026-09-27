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
    feature: 'MaterialTextureMap',
    namespace: '3ds',
    reason: 'read by threeDsMaterialHandler as part of the MATERIAL chunk',
  },
  {
    feature: 'Image',
    namespace: 'dae',
    reason: 'read by colladaMaterialDecoder, which indexes the image library to resolve a texture reference',
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
    reason:
      'the core parse always reads it: the header, triangles, texcoords and frame 0 are what make the file a model, so there is nothing to opt out of',
  },
  {
    feature: 'Mesh',
    namespace: 'md5',
    reason:
      'the core parse always reads it: without the mesh sections there is no model, so there is nothing to opt out of',
  },
  {
    feature: 'Face',
    namespace: 'obj',
    reason: 'the core parse always reads it: faces are the geometry, so there is nothing to opt out of',
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

/** Builds every built-in disposition, sorted so the generated source is byte-stable across runs. */
export function buildRequirementDispositions(): readonly RequirementDisposition[] {
  const dispositions: RequirementDisposition[] = [];
  for (const { feature, namespace, reason } of ALWAYS_READ_FORMAT_FEATURES) {
    for (const backend of DISPOSITION_BACKENDS) {
      dispositions.push({ backend, facet: RequirementFacet.DocumentFormat, kind: `${namespace}.${feature}`, reason });
    }
  }
  return dispositions.sort((a, b) => a.kind.localeCompare(b.kind) || a.backend.localeCompare(b.backend));
}
