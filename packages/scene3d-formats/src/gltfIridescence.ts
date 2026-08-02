import { createIridescencePbrExtension } from '@flighthq/materials/contract';
import type { GltfExtensionHandler } from '@flighthq/types/contract';

import { attachGltfPbrExtension } from './gltfMaterialExtension';

// KHR_materials_iridescence — view-dependent thin-film interference (soap bubbles, oil films, beetle
// shells). The two thickness bounds are in NANOMETRES, and the thickness texture's green channel
// interpolates between them rather than carrying an absolute depth, which is why both bounds have to
// import even when a texture is present.
export const GltfIridescenceExtensionHandler: GltfExtensionHandler = {
  apply(context) {
    const materials = context.source.materials ?? [];
    for (let i = 0; i < materials.length; i++) {
      const block = materials[i].extensions?.KHR_materials_iridescence;
      if (block === undefined) continue;
      attachGltfPbrExtension(
        context.document,
        i,
        createIridescencePbrExtension({
          iridescence: block.iridescenceFactor ?? 0,
          iridescenceIor: block.iridescenceIor ?? GLTF_DEFAULT_IRIDESCENCE_IOR,
          iridescenceMap: context.resolveTexture(block.iridescenceTexture, 'linear'),
          iridescenceThicknessMap: context.resolveTexture(block.iridescenceThicknessTexture, 'linear'),
          iridescenceThicknessMax: block.iridescenceThicknessMaximum ?? GLTF_DEFAULT_IRIDESCENCE_THICKNESS_MAX,
          iridescenceThicknessMin: block.iridescenceThicknessMinimum ?? GLTF_DEFAULT_IRIDESCENCE_THICKNESS_MIN,
        }),
      );
    }
  },
  kind: 'KHR_materials_iridescence',
};

// glTF spec defaults for the thin film: a 1.3 IOR, and a 100–400nm thickness range.
const GLTF_DEFAULT_IRIDESCENCE_IOR = 1.3;
const GLTF_DEFAULT_IRIDESCENCE_THICKNESS_MAX = 400;
const GLTF_DEFAULT_IRIDESCENCE_THICKNESS_MIN = 100;
