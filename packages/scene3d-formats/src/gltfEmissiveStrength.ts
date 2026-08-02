import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { ExtendedPbrMaterial, GltfExtensionHandler, StandardPbrMaterial } from '@flighthq/types/contract';
import { ExtendedPbrMaterialKind, ImportDiagnosticSeverity, StandardPbrMaterialKind } from '@flighthq/types/contract';

// KHR_materials_emissive_strength. A scalar multiplier on the emissive term the core already resolved —
// no new descriptor and no promotion, because `emissiveStrength` is a field of the standard block itself.
// Values above 1 push the surface past display white, which is what drives bloom; without this handler
// every imported material sits at 1 and an authored glow imports as a flat color.
export const GltfEmissiveStrengthExtensionHandler: GltfExtensionHandler = {
  apply(context) {
    const materials = context.source.materials ?? [];
    let negative = 0;
    for (let i = 0; i < materials.length; i++) {
      const strength = materials[i].extensions?.KHR_materials_emissive_strength?.emissiveStrength;
      if (strength === undefined) continue;
      if (!(strength >= 0)) {
        negative++;
        continue;
      }
      const material = context.document.materials[i];
      if (material === undefined) continue;
      if (material.kind === StandardPbrMaterialKind) {
        (material as unknown as StandardPbrMaterial).emissiveStrength = strength;
      } else if (material.kind === ExtendedPbrMaterialKind) {
        // Another handler may have promoted this material already; the strength belongs to the standard
        // block either way, so follow it rather than skipping the material.
        (material as unknown as ExtendedPbrMaterial).standard.emissiveStrength = strength;
      }
    }
    if (negative > 0) {
      reportImportDiagnostic(
        context.diagnostics,
        ImportDiagnosticSeverity.Drop,
        'gltf.emissive-strength-negative',
        'GltfEmissiveStrengthExtensionHandler',
        { count: negative },
      );
    }
  },
  kind: 'KHR_materials_emissive_strength',
};
