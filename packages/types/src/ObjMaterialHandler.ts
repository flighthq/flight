import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { MaterialLike } from './Material.ts';
import type { ObjMaterial } from './ObjSchema.ts';
import type { Scene3DDocument } from './Scene3DDocument.ts';

/**
 * One OBJ material-model handler — the unit of opt-in for the OBJ importer's material dispatch.
 *
 * OBJ/MTL carries two shading models: classic Blinn-Phong (Ka/Kd/Ks/Ns) and PBR metallic-roughness
 * (Pr/Pm/Ke plus extensions). The monolithic parser dispatches on `hasObjPbrDirectives`; this seam
 * decomposes that dispatch so a build that knows its files never use PBR can drop the StandardPbr
 * path entirely and vice versa.
 *
 * Handlers are tried in registration order; the first whose `matches` returns true resolves the
 * material. A material matched by no handler falls through as unresolved (index -1, resolved to
 * StandardMaterialKind at draw time).
 */
export interface ObjMaterialHandler {
  matches(material: Readonly<ObjMaterial>): boolean;
  resolve(
    material: Readonly<ObjMaterial>,
    document: Scene3DDocument,
    diagnostics: ImportDiagnostic[] | undefined,
  ): MaterialLike;
}
