import { createScene3DFromDocument } from '@flighthq/scene3d/contract';
import type { ImportDiagnostic, Md2ImportOptions, Scene3D, Scene3DDocument } from '@flighthq/types/contract';

import { parseMd2WithSectionHandlers } from './md2Parse.ts';
import { md2AllSectionHandlers } from './md2SectionRegistry.ts';

/**
 * Parses an id Software MD2 (Quake 2) binary model and assembles it into a live `Scene3D`.
 *
 * Convenience over `createScene3DFromDocument(parseMd2(bytes))`; never throws on bad input.
 */
export function createScene3DFromMd2(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<Md2ImportOptions>,
): Scene3D {
  return createScene3DFromDocument(parseMd2(bytes, diagnostics, options));
}

/**
 * Parses an id Software MD2 (Quake 2) binary model into a format-neutral `Scene3DDocument`.
 *
 * One Mesh node whose base pose is frame 0, with per-frame vertex animation carried as a `MeshMorph` —
 * each later frame a position/normal delta target — and one weights animation per named frame run driving
 * it. Malformed input returns an empty document, recording a diagnostic when a collector is engaged.
 *
 * ★ THIS MODULE EXISTS TO OWN ONE IMPORT EDGE. The section handlers pull in `@flighthq/materials` and
 * `@flighthq/animation`, so resolving the default family inside `md2Parse` would put both back into the
 * module that reads geometry — undoing the decomposition even for a caller who named a subset, because the
 * import graph, not the call graph, decides what a bundler keeps.
 *
 * Omitting `options.sectionHandlers` runs the full standard family, which reproduces the parse this
 * function performed when the skin and frame sections were read unconditionally.
 */
export function parseMd2(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<Md2ImportOptions>,
): Scene3DDocument {
  return parseMd2WithSectionHandlers(bytes, diagnostics, options?.sectionHandlers ?? md2AllSectionHandlers);
}
