import { packLinearToColor } from '@flighthq/color/contract';
import { createSpecularPbrExtension } from '@flighthq/materials/contract';
import type { GltfExtensionHandler } from '@flighthq/types/contract';

import { attachGltfPbrExtension } from './gltfMaterialExtension';

// KHR_materials_specular — retunes the dielectric F0 independently of roughness and metalness, so a
// surface can be made less (or differently) reflective without pretending to be rough. Both factors
// default to full, meaning an extension block stating nothing is the same surface as no extension.
//
// The two textures split by channel and therefore by color space: the STRENGTH rides the alpha of
// `specularTexture` (linear data), while `specularColorTexture` is RGB color and samples sRGB.
export const GltfSpecularExtensionHandler: GltfExtensionHandler = {
  apply(context) {
    const materials = context.source.materials ?? [];
    for (let i = 0; i < materials.length; i++) {
      const block = materials[i].extensions?.KHR_materials_specular;
      if (block === undefined) continue;
      const color = block.specularColorFactor ?? [1, 1, 1];
      attachGltfPbrExtension(
        context.document,
        i,
        createSpecularPbrExtension({
          specular: block.specularFactor ?? 1,
          specularColor: packLinearToColor([color[0] ?? 1, color[1] ?? 1, color[2] ?? 1, 1]),
          specularColorMap: context.resolveTexture(block.specularColorTexture, 'srgb'),
          specularMap: context.resolveTexture(block.specularTexture, 'linear'),
        }),
      );
    }
  },
  kind: 'KHR_materials_specular',
};
