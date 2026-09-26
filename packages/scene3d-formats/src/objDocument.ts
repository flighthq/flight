import { createScene3DFromDocument } from '@flighthq/scene3d/contract';
import type {
  ImportDiagnostic,
  ObjImportOptions,
  ObjMaterialLibrary,
  Scene3D,
  Scene3DDocument,
} from '@flighthq/types/contract';

import { objAllMaterialHandlers } from './objMaterialRegistry.ts';
import { parseObjWithMaterialHandlers } from './objParse.ts';

/**
 * Parses a Wavefront OBJ text source and assembles it into a live `Scene3D`.
 *
 * Convenience over `createScene3DFromDocument(parseObj(source, materials))`; never throws on bad input.
 */
export function createScene3DFromObj(
  source: string,
  materials?: Readonly<ObjMaterialLibrary>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<ObjImportOptions>,
): Scene3D {
  return createScene3DFromDocument(parseObj(source, materials, diagnostics, options));
}

/**
 * Parses a Wavefront OBJ text source into a format-neutral `Scene3DDocument`.
 *
 * Each `g`/`o` group becomes one document mesh with one subset per material, and the referenced MTL
 * library's materials are registered into the document's material table, deduped by name. Malformed lines
 * record a diagnostic and are skipped; the function never throws on bad input.
 *
 * Supported directives: `v`, `vn`, `vt`, `f`, `l`, `p`, `g`, `o`, `mtllib`, `usemtl`. Faces may be
 * triangles, quads, or N-gons (fan-triangulated), and face vertex references support independent
 * position/uv/normal indices (`v/vt/vn`, `v//vn`, `v/vt`) and negative (relative) indices.
 *
 * ★ THIS MODULE EXISTS TO OWN ONE IMPORT EDGE. The standard material handlers import
 * `hasObjPbrDirectives` and the `objMaterialTo*` functions from `objParse`, so resolving the default family
 * inside that module would close a cycle — parser to registry to handlers and back.
 *
 * I MEASURED that cycle rather than assuming it breaks: with the family resolved inside `objParse`, real
 * Node loads it without error, because everything the handlers reach for there is a hoisted `function`
 * declaration that is initialized before any statement runs. So the split is not repairing a crash that
 * exists today. It removes the dependency on that hoisting: turn `hasObjPbrDirectives` into a `const`
 * arrow tomorrow and the cycle starts failing in Node while every vitest run stays green, which is the
 * worst shape a defect can have. The equivalent 3DS seam DID throw
 * ("Cannot access 'threeDsCameraHandler' before initialization"), so this is the same structure applied
 * before it is load-bearing rather than after.
 *
 * Omitting `options.materialHandlers` runs the full standard family, which reproduces the dispatch this
 * function performed when it was a hardcoded `hasObjPbrDirectives` ternary. Naming a subset is what keeps
 * the code behind a shading model out of a build that never reads one.
 */
export function parseObj(
  source: string,
  materials?: Readonly<ObjMaterialLibrary>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<ObjImportOptions>,
): Scene3DDocument {
  return parseObjWithMaterialHandlers(
    source,
    materials,
    diagnostics,
    options?.materialHandlers ?? objAllMaterialHandlers,
  );
}
