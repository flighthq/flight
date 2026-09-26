import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { collectMd5AnimFeatures } from './md5AnimFeatures.ts';
import { MD5_REQUIREMENT_KEY_NAMESPACE } from './scene3dFormatRequirements.ts';

/**
 * Build-time inventory of what one MD5 animation file (.md5anim) asks a build to support.
 *
 * The `.md5anim` file carries animation data but no mesh, material, or skeleton content — those
 * live in the paired `.md5mesh`. This analyzer emits only `document.format` requirements under
 * the `md5` namespace (`md5.Hierarchy`, `md5.Animation`) and never claims any
 * `scene.material-kind`, because the animation file itself requires no material renderer.
 *
 * Keys are namespaced under the MD5 family (`md5.Hierarchy`, `md5.Animation`) so they share the
 * `md5` namespace with the mesh analyzer's `md5.Mesh`, `md5.Skeleton`, and `md5.Material`.
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function parseMd5AnimRequirements(source: string): RequirementSet {
  const features = collectMd5AnimFeatures(source);
  const requirements: Requirement[] = [];
  for (const feature of [...features].sort()) {
    requirements.push({
      facet: RequirementFacet.DocumentFormat,
      key: `${MD5_REQUIREMENT_KEY_NAMESPACE}.${feature}`,
    });
  }
  return createRequirementSet([RequirementFacet.DocumentFormat, RequirementFacet.SceneMaterialKind], requirements);
}
