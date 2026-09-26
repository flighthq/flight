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
  /**
   * The shading model this handler reads, as the feature name the analyzer emits under `document.format`.
   *
   * ★ THE FEATURE NAME IS WHAT MAKES A CATALOG ROW DERIVABLE. Both handlers used to answer one coarse
   * `obj.Material` key, and two rows for one key collide under the catalog's own row identity — so OBJ got no
   * parser row at all. Declaring the model each handler reads splits that key in two, and a row can then be
   * derived from the shipped family by identity rather than transcribed beside it.
   */
  readonly feature: string;
  matches(material: Readonly<ObjMaterial>): boolean;
  resolve(
    material: Readonly<ObjMaterial>,
    document: Scene3DDocument,
    diagnostics: ImportDiagnostic[] | undefined,
  ): MaterialLike;
}

/**
 * What `parseObj` accepts beyond the source text and its material library.
 *
 * ★ THE HANDLER FAMILY IS THE TREE-SHAKING BOUNDARY. OBJ/MTL carries two shading models, and a build that
 * knows its files never state metallic-roughness should not link the StandardPbr path — nor the material
 * package code behind it. Naming a subset is what drops it. Leaving `materialHandlers` undefined runs the
 * full standard family, which reproduces the dispatch this function performed when it was a hardcoded
 * `hasObjPbrDirectives` ternary.
 *
 * ORDER IS PRESERVED as given: handlers are tried in sequence and the FIRST match resolves the material, so
 * a caller reordering the family is describing a different dispatch rather than the same one rearranged.
 */
export interface ObjImportOptions {
  readonly materialHandlers?: readonly Readonly<ObjMaterialHandler>[];
}

/** The feature name for MTL's classic Ka/Kd/Ks/Ns shading model. */
export const OBJ_MATERIAL_BLINN_PHONG_FEATURE = 'MaterialBlinnPhong';

/** The feature name for MTL's metallic-roughness PBR extensions (Pr/Pm and the sheen/clearcoat family). */
export const OBJ_MATERIAL_STANDARD_PBR_FEATURE = 'MaterialStandardPbr';
