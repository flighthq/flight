import { createAnisotropyPbrExtension } from '@flighthq/materials/contract';
import type { GltfExtensionHandler } from '@flighthq/types/contract';

import { attachGltfPbrExtension } from './gltfMaterialExtension';

// KHR_materials_anisotropy — stretches the microfacet response along the mesh tangents, which is what
// gives brushed metal and hair their directional highlight. The texture packs a tangent-space direction
// in RG and the strength in B, so it is linear data throughout; `anisotropyRotation` is in RADIANS,
// matching the geometry layer rather than the degrees an authoring property would use.
export const GltfAnisotropyExtensionHandler: GltfExtensionHandler = {
  apply(context) {
    const materials = context.source.materials ?? [];
    for (let i = 0; i < materials.length; i++) {
      const block = materials[i].extensions?.KHR_materials_anisotropy;
      if (block === undefined) continue;
      attachGltfPbrExtension(
        context.document,
        i,
        createAnisotropyPbrExtension({
          anisotropyMap: context.resolveTexture(block.anisotropyTexture, 'linear'),
          anisotropyRotation: block.anisotropyRotation ?? 0,
          anisotropyStrength: block.anisotropyStrength ?? 0,
        }),
      );
    }
  },
  kind: 'KHR_materials_anisotropy',
};
