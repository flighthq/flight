import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { STL_REQUIREMENT_KEY_NAMESPACE } from './scene3dFormatRequirements.ts';
import { collectStlFeatures, STL_MESH_FEATURE } from './stlFeatures.ts';

/**
 * Build-time inventory of what one STL file asks a build to support: `stl.Mesh`, and nothing else, ever.
 *
 * ★ ONE KEY IS THE HONEST ANSWER, NOT A PLACEHOLDER. The richer formats emit a requirement per feature because
 * they HAVE features a build can be missing — a COLLADA with no animation needs no animation decoder. STL has
 * triangles and nothing else: no materials, no animation, no skins, no hierarchy, no texture coordinates. So
 * there is exactly one thing a build needs in order to read any STL, and emitting a second key — or a
 * `scene.material-kind` the format cannot describe — would put an implementation in the bundle for content that
 * does not exist.
 *
 * `stl.Mesh` has no catalog row for the same reason, and that absence is RECORDED rather than left to be noticed:
 * it is declared always-read in the built-in dispositions, so the codegen reports it resolved-by-decision instead
 * of as an unmet requirement. Inventing a selectable family to give it a row to point at would be a shape built
 * for symmetry with other formats rather than for any caller.
 *
 * Returns an EMPTY set for bytes no reading recognises. `collectStlFeatures` is the paired readability question:
 * a truncated binary STL and a text file that merely contains the word `solid` both answer null there, and both
 * would otherwise be indistinguishable from a file that genuinely requires nothing.
 */
export function parseStlRequirements(bytes: Readonly<Uint8Array>): RequirementSet {
  const features = collectStlFeatures(bytes);
  const requirements: Requirement[] =
    features === null
      ? []
      : [
          {
            facet: RequirementFacet.DocumentFormat,
            key: `${STL_REQUIREMENT_KEY_NAMESPACE}.${STL_MESH_FEATURE}`,
          },
        ];
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}
