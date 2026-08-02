import { createExtendedPbrMaterial, createStandardPbrMaterialProperties } from '@flighthq/materials/contract';
import type {
  ExtendedPbrMaterial,
  MaterialLike,
  PbrExtension,
  Scene3DDocument,
  StandardPbrMaterial,
} from '@flighthq/types/contract';
import { ExtendedPbrMaterialKind, StandardPbrMaterialKind } from '@flighthq/types/contract';

// Attaches one PBR extension descriptor to the document material at `index`, promoting it from the
// StandardPbrMaterial the core built into an ExtendedPbrMaterial the first time an extension lands on it.
//
// Every KHR_materials_* handler needs this same step, and they must COMPOSE: a file using clearcoat and
// sheen together runs two independently imported handlers over one material, and whichever goes second
// has to append to the first's work rather than re-promote and discard it. So promotion is idempotent —
// an already-extended material just gains another entry — and the standard property block is carried
// across by reference-copy so the base color, maps, and alpha mode the core resolved all survive.
//
// A duplicate kind is dropped rather than appended: the extension list is an ordered set the backends
// dedupe on anyway, and two descriptors of one kind have no defined composition.
export function attachGltfPbrExtension(document: Scene3DDocument, index: number, extension: PbrExtension): boolean {
  const existing = document.materials[index];
  if (existing === undefined) return false;

  if (existing.kind === ExtendedPbrMaterialKind) {
    const extended = existing as unknown as ExtendedPbrMaterial;
    if (extended.extensions.some((entry) => entry.kind === extension.kind)) return false;
    extended.extensions = [...extended.extensions, extension];
    return true;
  }

  // Only the metallic-roughness lane can carry these; an unlit or specular-glossiness material has no
  // standard block to extend, and silently converting it would discard its own shading model.
  if (existing.kind !== StandardPbrMaterialKind) return false;

  const standard = existing as unknown as StandardPbrMaterial;
  const promoted = createExtendedPbrMaterial({
    extensions: [extension],
    standard: createStandardPbrMaterialProperties(standard),
  });
  promoted.alphaCutoff = standard.alphaCutoff;
  promoted.alphaMode = standard.alphaMode;
  promoted.doubleSided = standard.doubleSided;
  promoted.name = standard.name;
  document.materials[index] = promoted as unknown as MaterialLike;
  return true;
}
