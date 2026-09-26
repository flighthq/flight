import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { BlinnPhongMaterialKind, RequirementFacet } from '@flighthq/types/contract';

import { collectMd2Features } from './md2Features.ts';
import { MD2_REQUIREMENT_KEY_NAMESPACE } from './scene3dFormatRequirements.ts';

/**
 * Build-time inventory of what one MD2 file asks a build to support: one `document.format`
 * requirement per distinct feature the file contains, plus a `scene.material-kind` requirement
 * for `BlinnPhongMaterial` when skins are present.
 *
 * ★ PER FEATURE, NOT PER FORMAT. The coarse version (`MD2_DOCUMENT_SCENE_REQUIREMENTS`) emitted
 * BlinnPhong for every `.md2` file regardless of content. A geometry-only MD2 (no skins) does not
 * need any material renderer, and this inventory reflects that.
 *
 * MD2 has no PBR shading model — skins are diffuse texture paths decoded as BlinnPhongMaterial —
 * so BlinnPhong is the only material kind this analyzer claims.
 *
 * Keys are namespaced by format (`md2.Mesh`, `md2.Material`, `md2.Animation`).
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function parseMd2Requirements(source: Readonly<Uint8Array>): RequirementSet {
  const features = collectMd2Features(source);
  const requirements: Requirement[] = [];
  if (features !== null) {
    for (const feature of [...features].sort()) {
      requirements.push({
        facet: RequirementFacet.DocumentFormat,
        key: `${MD2_REQUIREMENT_KEY_NAMESPACE}.${feature}`,
      });
    }
    if (features.has('Material')) {
      requirements.push({
        facet: RequirementFacet.SceneMaterialKind,
        key: BlinnPhongMaterialKind,
      });
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat, RequirementFacet.SceneMaterialKind], requirements);
}
