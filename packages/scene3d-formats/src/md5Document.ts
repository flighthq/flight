import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createScene3DFromDocument } from '@flighthq/scene3d/contract';
import type { ImportDiagnostic, Md5ImportOptions, Scene3D, Scene3DDocument } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { parseMd5Anim } from './md5AnimParse.ts';
import { parseMd5MeshWithSectionHandlers } from './md5Parse.ts';
import { md5AllSectionHandlers } from './md5SectionRegistry.ts';
import { findScene3DSkeletonJoints } from './sceneSkeleton.ts';

/**
 * Parses an id Tech 4 MD5 mesh file (`.md5mesh`) and assembles it into a live `Scene3D`.
 *
 * Convenience over `createScene3DFromDocument(parseMd5Mesh(source, diagnostics))`.
 */
export function createScene3DFromMd5Mesh(
  source: string,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<Md5ImportOptions>,
): Scene3D {
  return createScene3DFromDocument(parseMd5Mesh(source, diagnostics, options));
}

/**
 * One-call MD5 import: builds the `Scene3D` from the `.md5mesh` source and, when a `.md5anim` source is
 * given, binds its skeletal animation to that mesh's skeleton and stores it in `scene.animations`.
 *
 * MD5 splits mesh and animation across two files that must be composed against the SAME skeleton — the mesh
 * supplies the joint nodes the animation's channels bind to — so this is the composition callers would
 * otherwise hand-write. The `.md5anim` carries no name of its own, so the clip is keyed 'default'; a caller
 * loading several animations against one mesh uses `parseMd5Anim` directly and keys each as it likes.
 *
 * Warns and skips the animation when `animSource` is given but the mesh carries no skeleton to bind it to —
 * which a caller can now also cause by omitting the skeleton handler, not only by supplying a jointless
 * file.
 */
export function importMd5Mesh(
  meshSource: string,
  animSource?: string | null,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<Md5ImportOptions>,
): Scene3D {
  const scene = createScene3DFromMd5Mesh(meshSource, diagnostics, options);
  if (animSource == null) return scene;

  const joints = findScene3DSkeletonJoints(scene.root);
  if (joints === null) {
    // Drop, not Skip. Skip means a RECOGNIZED-but-unsupported feature was ignored — a gap in what this
    // importer implements. Skeletal animation IS implemented; what failed is the DATA, a caller pairing an
    // .md5anim with a mesh that carries no skeleton to bind it to. The animation is lost, which is Drop by
    // definition, and the distinction is load-bearing: a Skip here exempts itself from every severity-based
    // "did the importer complain" check.
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'md5mesh.animation-no-skeleton',
      'importMd5Mesh',
    );
    return scene;
  }

  const clip = parseMd5Anim(animSource, joints, diagnostics);
  if (clip !== null) scene.animations.default = clip;
  return scene;
}

/**
 * Parses an id Tech 4 MD5 mesh file (`.md5mesh`) into a format-neutral `Scene3DDocument`.
 *
 * Each `mesh { }` section becomes one skinned Mesh node (joints0/weights0), and the `joints { }` block
 * becomes a "skeleton" group plus a joint subtree in `nodes` with one entry in `skins`. The subtlety MD5
 * skinning is usually got wrong on: `.md5mesh` joint transforms are ABSOLUTE, but `.md5anim` frames are
 * parent-RELATIVE — so each joint node carries its parent-relative local transform while `parseMd5Anim`
 * drives its already-relative values onto the same joints, and both pose one consistent hierarchy.
 *
 * MD5 splits mesh and animation across two files, so the document's `animations` table is empty; use
 * `importMd5Mesh` to bind a paired `.md5anim` in one call. Malformed lines record a diagnostic and are
 * skipped; the function never throws on bad input.
 *
 * ★ THIS MODULE EXISTS TO OWN ONE IMPORT EDGE. The section handlers pull in `@flighthq/materials`, and the
 * skeleton handler imports `md5Parse` for the emitter it wraps, so resolving the default family inside
 * `md5Parse` would both put that package back into the module that reads geometry and close a cycle.
 *
 * Omitting `options.sectionHandlers` runs the full standard family, which reproduces the parse this function
 * performed when the skeleton and the per-section shader were read unconditionally.
 */
export function parseMd5Mesh(
  source: string,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<Md5ImportOptions>,
): Scene3DDocument {
  return parseMd5MeshWithSectionHandlers(source, diagnostics, options?.sectionHandlers ?? md5AllSectionHandlers);
}
