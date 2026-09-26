import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { BlinnPhongMaterialKind, RequirementFacet } from '@flighthq/types/contract';

import { collectMd5MeshFeatures } from './md5MeshFeatures.ts';
import { MD5_REQUIREMENT_KEY_NAMESPACE } from './scene3dFormatRequirements.ts';

/**
 * Build-time inventory of what one MD5 mesh file asks a build to support: one `document.format`
 * requirement per distinct feature the file contains, plus a `scene.material-kind` requirement
 * for `BlinnPhongMaterial` when shader references are present.
 *
 * ★ PER FEATURE, NOT PER FORMAT. The coarse version (`MD5_DOCUMENT_SCENE_REQUIREMENTS`) emitted
 * BlinnPhong for every `.md5mesh` file regardless of content. A skeleton-only MD5 mesh (with no
 * shader directives) does not need any material renderer, and this inventory reflects that.
 *
 * MD5 has no PBR shading model — shaders are texture paths decoded as BlinnPhongMaterial — so
 * BlinnPhong is the only material kind this analyzer claims.
 *
 * Keys are namespaced under the MD5 family (`md5.Mesh`, `md5.Skeleton`, `md5.Material`).
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function parseMd5MeshRequirements(source: string): RequirementSet {
  const features = collectMd5MeshFeatures(source);
  const requirements: Requirement[] = [];
  for (const feature of [...features].sort()) {
    requirements.push({
      facet: RequirementFacet.DocumentFormat,
      key: `${MD5_REQUIREMENT_KEY_NAMESPACE}.${feature}`,
    });
  }
  if (features.has('Material')) {
    requirements.push({
      facet: RequirementFacet.SceneMaterialKind,
      key: BlinnPhongMaterialKind,
    });
  }
  return createRequirementSet([RequirementFacet.DocumentFormat, RequirementFacet.SceneMaterialKind], requirements);
}
