import { packLinearToColor } from '@flighthq/color/contract';
import { createSheenPbrExtension } from '@flighthq/materials/contract';
import type { GltfExtensionHandler } from '@flighthq/types/contract';

import { attachGltfPbrExtension } from './gltfMaterialExtension';

// KHR_materials_sheen — the grazing-angle retroreflective lobe cloth and fabric need. `sheenColorFactor`
// is LINEAR RGB in the file while Flight's packed colors are sRGB-encoded, so it takes the same
// packLinearToColor round the base material's factors take. Its color texture IS color and samples sRGB;
// the roughness texture is data and samples linear.
export const GltfSheenExtensionHandler: GltfExtensionHandler = {
  apply(context) {
    const materials = context.source.materials ?? [];
    for (let i = 0; i < materials.length; i++) {
      const block = materials[i].extensions?.KHR_materials_sheen;
      if (block === undefined) continue;
      const color = block.sheenColorFactor ?? [0, 0, 0];
      attachGltfPbrExtension(
        context.document,
        i,
        createSheenPbrExtension({
          sheenColor: packLinearToColor([color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, 1]),
          sheenColorMap: context.resolveTexture(block.sheenColorTexture, 'srgb'),
          sheenRoughness: block.sheenRoughnessFactor ?? 0,
          sheenRoughnessMap: context.resolveTexture(block.sheenRoughnessTexture, 'linear'),
        }),
      );
    }
  },
  kind: 'KHR_materials_sheen',
};
