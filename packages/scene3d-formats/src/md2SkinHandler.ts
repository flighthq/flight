import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createBlinnPhongMaterial } from '@flighthq/materials/contract';
import type { Material, MaterialLike, Md2SectionHandler } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { MD2_SKIN_SIZE } from './md2Schema.ts';
import { createExternalTextureRef } from './shared.ts';

/**
 * Reads MD2's skin records into the document's material table.
 *
 * MD2 has no lighting-model parameters — each skin is a texture path, and a model's several skins are
 * alternate diffuse textures for the SAME mesh, one active at a time. So every skin becomes a
 * BlinnPhongMaterial a caller can swap in, and only the first non-empty one is bound to the mesh's single
 * subset. MD2's own shading is diffuse-textured.
 *
 * Omitting this handler is what keeps `@flighthq/materials` and the texture-reference machinery out of a
 * build that reads MD2 files for their geometry alone; the mesh then carries no material index, which
 * resolves to StandardMaterialKind at draw time exactly as a model with no skins already did.
 */
export const md2SkinHandler: Readonly<Md2SectionHandler> = {
  collect(context) {
    const { bytes, diagnostics, document, meshMaterials, numSkins, offSkins } = context;
    // Empty (all-null path) skin records are counted in numSkins but yield no material; tallied here and
    // flushed as one crumb after the loop rather than reported per skin (aggregate-once).
    let emptySkinCount = 0;
    let firstEmptySkin = -1;
    for (let s = 0; s < numSkins; s++) {
      const skinOffset = offSkins + s * MD2_SKIN_SIZE;
      if (skinOffset + MD2_SKIN_SIZE > bytes.length) {
        reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'md2.skin-record-truncated', 'parseMd2', {
          skin: s,
        });
        break;
      }
      const skinName = readMd2SkinName(bytes, skinOffset);
      if (skinName.length === 0) {
        if (emptySkinCount === 0) firstEmptySkin = s;
        emptySkinCount++;
        continue;
      }
      const material = createBlinnPhongMaterial({
        diffuseMap: createExternalTextureRef(skinName, null, document.resources),
      }) as unknown as Material;
      // MD2's skin path is the material's authored identity — preserve it as the name.
      material.name = skinName;
      const index = document.materials.length;
      document.materials.push(material as unknown as MaterialLike);
      // Bind the first non-empty skin to the mesh; the rest stay available as alternates.
      if (meshMaterials.length === 0) meshMaterials.push(index);
    }
    if (emptySkinCount > 0) {
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'md2.skin-empty-path', 'parseMd2', {
        count: emptySkinCount,
        firstSkin: firstEmptySkin,
      });
    }
  },
  feature: 'Material',
};

/**
 * The skin family, as the list a selective caller names.
 *
 * ★ IT LIVES BESIDE ITS HANDLER BECAUSE OF WHERE IT USED TO LIVE. Both MD2 family constants sat in
 * `md2SectionRegistry.ts` next to `md2AllSectionHandlers`, so naming EITHER family imported that module and linked BOTH
 * handlers — which is why a build asking for skins alone still carried the animation reader, and one asking for
 * animation alone still carried this reader and `@flighthq/materials` — 9,480 measured bytes (35,761 → 26,281) for a
 * family it had declined, against 3,057 the other way (35,751 → 32,694). A family constant is one element long; keeping it here is what
 * makes naming it cost one handler.
 */
export const md2SkinFamily: readonly Md2SectionHandler[] = [md2SkinHandler];

// Reads one MD2 skin record's NUL-terminated texture path out of its fixed 64-byte field.
function readMd2SkinName(bytes: Readonly<Uint8Array>, offset: number): string {
  const limit = offset + MD2_SKIN_SIZE;
  let end = offset;
  while (end < limit && bytes[end] !== 0) end++;
  let name = '';
  for (let i = offset; i < end; i++) name += String.fromCharCode(bytes[i]);
  return name;
}
