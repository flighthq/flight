import { packLinearToColor } from '@flighthq/color/contract';
import { createSpecularGlossinessPbrMaterial } from '@flighthq/materials/contract';
import type { GltfExtensionHandler, MaterialLike, StandardPbrMaterial } from '@flighthq/types/contract';
import { StandardPbrMaterialKind } from '@flighthq/types/contract';

// KHR_materials_pbrSpecularGlossiness — the deprecated workflow that REPLACES a material's
// metallic-roughness block rather than extending it. This is the one handler that swaps the document
// material outright instead of attaching a descriptor, because specular-glossiness is a different
// shading model, not a contribution to the standard one.
//
// It imports as a `SpecularGlossinessPbrMaterial`, keeping the model the file authored. Flight also
// ships `convertSpecularGlossinessToStandardPbr`, and converting here instead would be the tempting
// shortcut — the extension is deprecated, so metallic-roughness is where the asset is "supposed" to end
// up. That is rejected for the same reason MTL is not unconditionally reinterpreted: a parser represents
// what the file says, and a lossy remap belongs at an explicit, caller-invoked seam where the caller can
// see it happen. A consumer wanting the standard lane calls the converter by name.
//
// The channels the two models SHARE — normal, occlusion, emissive, alpha — are carried across from the
// material the core already built, so nothing the base parse resolved is lost in the swap.
export const GltfSpecularGlossinessExtensionHandler: GltfExtensionHandler = {
  apply(context) {
    const materials = context.source.materials ?? [];
    for (let i = 0; i < materials.length; i++) {
      const block = materials[i].extensions?.KHR_materials_pbrSpecularGlossiness;
      if (block === undefined) continue;
      const existing = context.document.materials[i];
      // Only the core's own metallic-roughness output is replaceable. Anything else means another
      // handler already claimed this material, and clobbering its work would be worse than declining.
      if (existing === undefined || existing.kind !== StandardPbrMaterialKind) continue;
      const standard = existing as unknown as StandardPbrMaterial;

      const diffuse = block.diffuseFactor ?? [1, 1, 1, 1];
      const specular = block.specularFactor ?? [1, 1, 1];
      const replacement = createSpecularGlossinessPbrMaterial({
        diffuse: packLinearToColor([diffuse[0] ?? 1, diffuse[1] ?? 1, diffuse[2] ?? 1, diffuse[3] ?? 1]),
        diffuseMap: context.resolveTexture(block.diffuseTexture, 'srgb'),
        // Shared channels ride across from the base material rather than being re-resolved, so the
        // swap cannot disagree with the core about sampler, color space, or UV transform.
        emissive: standard.emissive,
        emissiveMap: standard.emissiveMap,
        emissiveStrength: standard.emissiveStrength,
        glossiness: block.glossinessFactor ?? 1,
        normalMap: standard.normalMap,
        normalScale: standard.normalScale,
        occlusionMap: standard.occlusionMap,
        occlusionStrength: standard.occlusionStrength,
        specular: packLinearToColor([specular[0] ?? 1, specular[1] ?? 1, specular[2] ?? 1, 1]),
        // Specular in RGB, glossiness in A — one packed color texture, so sRGB.
        specularGlossinessMap: context.resolveTexture(block.specularGlossinessTexture, 'srgb'),
      });
      replacement.alphaCutoff = standard.alphaCutoff;
      replacement.alphaMode = standard.alphaMode;
      replacement.doubleSided = standard.doubleSided;
      replacement.name = standard.name;
      context.document.materials[i] = replacement as unknown as MaterialLike;
    }
  },
  kind: 'KHR_materials_pbrSpecularGlossiness',
};
