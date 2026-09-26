import { createBlinnPhongMaterial } from '@flighthq/materials/contract';
import type { Material, MaterialLike, Md5SectionHandler } from '@flighthq/types/contract';
import { MD5_MATERIAL_FEATURE } from '@flighthq/types/contract';

import { createExternalTextureRef } from './shared.ts';

/**
 * Turns a `mesh { }` block's `shader` line into the material that block binds.
 *
 * MD5 has no lighting-model parameters, so the shader path is decoded as a BlinnPhongMaterial — the id Tech
 * texture-and-lighting model — whose `diffuseMap` REFERENCES the path rather than loading it; resolving that
 * reference is `@flighthq/scene3d-resources`'s explicit step.
 *
 * ★ THIS HANDLER IS WHY `@flighthq/materials` IS LINKED. Omitting it leaves each mesh with an empty material
 * list, which resolves to StandardMaterialKind at draw time exactly as a section declaring no shader already
 * did — a smaller document, not a broken one.
 */
export const md5MaterialHandler: Readonly<Md5SectionHandler> = {
  collect(context) {
    const section = context.mesh;
    // Null at the file-level dispatch. This handler claims a per-mesh feature, so the parser only calls it
    // with a section set; the guard states that rather than assuming the caller got it right.
    if (section === null || section.shader.length === 0) return;
    const document = context.document;
    const material = createBlinnPhongMaterial({
      diffuseMap: createExternalTextureRef(section.shader, null, document.resources),
    }) as unknown as Material;
    // MD5's shader path is the material's authored identity — preserve it as the name.
    material.name = section.shader;
    section.materials.push(document.materials.length);
    document.materials.push(material as unknown as MaterialLike);
  },
  feature: MD5_MATERIAL_FEATURE,
};
