import { createUnlitMaterial } from '@flighthq/materials/contract';
import type { GltfExtensionHandler, MaterialLike, StandardPbrMaterial } from '@flighthq/types/contract';
import { StandardPbrMaterialKind } from '@flighthq/types/contract';

// KHR_materials_unlit — the surface is its base color, with no lighting evaluated at all. Like
// spec-gloss, this REPLACES the material rather than extending it: unlit is not a contribution to the
// metallic-roughness model, it is the absence of that model.
//
// The extension block itself is empty by definition; everything the unlit material needs (base color,
// its map, and the alpha state) already came out of the core's metallic-roughness parse, so this reads
// them across rather than re-resolving. Metallic, roughness, normal, occlusion and emissive have no
// meaning without lighting and are dropped by the model change itself — not a silent loss, but the
// stated point of the extension.
export const GltfUnlitExtensionHandler: GltfExtensionHandler = {
  apply(context) {
    const materials = context.source.materials ?? [];
    for (let i = 0; i < materials.length; i++) {
      if (materials[i].extensions?.KHR_materials_unlit === undefined) continue;
      const existing = context.document.materials[i];
      // Only the core's own output is replaceable; anything else means a sibling handler claimed it.
      if (existing === undefined || existing.kind !== StandardPbrMaterialKind) continue;
      const standard = existing as unknown as StandardPbrMaterial;

      const replacement = createUnlitMaterial({
        baseColor: standard.baseColor,
        baseColorMap: standard.baseColorMap,
      });
      replacement.alphaCutoff = standard.alphaCutoff;
      replacement.alphaMode = standard.alphaMode;
      replacement.doubleSided = standard.doubleSided;
      replacement.name = standard.name;
      context.document.materials[i] = replacement as unknown as MaterialLike;
    }
  },
  kind: 'KHR_materials_unlit',
};
