import { createClearcoatPbrExtension } from '@flighthq/materials/contract';
import type { GltfExtensionHandler } from '@flighthq/types/contract';

import { attachGltfPbrExtension } from './gltfMaterialExtension';

// KHR_materials_clearcoat — a second dielectric specular layer over the standard surface. The factor
// textures are LINEAR data, not color: the layer factor rides the red channel of `clearcoatTexture` and
// the roughness the green of `clearcoatRoughnessTexture`, so neither may be sRGB-decoded at sample time.
// The clearcoat normal map is its own tangent-space map, independent of the base material's.
export const GltfClearcoatExtensionHandler: GltfExtensionHandler = {
  apply(context) {
    const materials = context.source.materials ?? [];
    for (let i = 0; i < materials.length; i++) {
      const block = materials[i].extensions?.KHR_materials_clearcoat;
      if (block === undefined) continue;
      attachGltfPbrExtension(
        context.document,
        i,
        createClearcoatPbrExtension({
          clearcoat: block.clearcoatFactor ?? 0,
          clearcoatMap: context.resolveTexture(block.clearcoatTexture, 'linear'),
          clearcoatNormalMap: context.resolveTexture(block.clearcoatNormalTexture, 'linear'),
          clearcoatNormalScale: block.clearcoatNormalTexture?.scale ?? 1,
          clearcoatRoughness: block.clearcoatRoughnessFactor ?? 0,
          clearcoatRoughnessMap: context.resolveTexture(block.clearcoatRoughnessTexture, 'linear'),
        }),
      );
    }
  },
  kind: 'KHR_materials_clearcoat',
};
