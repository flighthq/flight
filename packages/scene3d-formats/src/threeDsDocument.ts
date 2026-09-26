import { createScene3DFromDocument } from '@flighthq/scene3d/contract';
import type { ImportDiagnostic, Scene3D, Scene3DDocument, ThreeDsImportOptions } from '@flighthq/types/contract';

import { buildThreeDsChunkDispatch, threeDsAllChunkHandlers } from './threeDsChunkRegistry.ts';
import { parseThreeDsDocumentWithDispatch } from './threeDsParse.ts';

/**
 * Parses a 3DS file and assembles it into a live `Scene3D`.
 *
 * Convenience over `createScene3DFromDocument(parse3ds(bytes))`; never throws on bad input.
 */
export function createScene3DFrom3ds(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<ThreeDsImportOptions>,
): Scene3D {
  return createScene3DFromDocument(parse3ds(bytes, diagnostics, options));
}

/**
 * Parses an Autodesk 3DS binary file into a format-neutral `Scene3DDocument`.
 *
 * Each named-object trimesh becomes one document mesh (inline geometry, canonical PBR layout, RH Z-up to
 * Y-up). Referenced materials are registered into the document's material table, deduped by name and
 * named per mesh by index. Malformed input returns an empty or partial document with a diagnostic rather
 * than throwing.
 *
 * ★ THIS MODULE EXISTS TO OWN ONE IMPORT EDGE. The chunk handlers import the parsers in `threeDsParse`,
 * so resolving the default family there would close a cycle — parser to registry to handlers and back.
 * Vitest tolerates such a cycle; Node throws "Cannot access 'threeDsCameraHandler' before
 * initialization". Keeping the default here means the parser module never sees the handler graph, and
 * this file is the only place that depends on both.
 *
 * Omitting `options.handlers` runs the full standard family, which reproduces the parse this function
 * performed when the chunk dispatch was hard-coded. Naming a subset is what keeps the code behind a
 * feature out of a build that never reads it.
 */
export function parse3ds(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<ThreeDsImportOptions>,
): Scene3DDocument {
  const dispatch = buildThreeDsChunkDispatch(options?.handlers ?? threeDsAllChunkHandlers);
  return parseThreeDsDocumentWithDispatch(bytes, diagnostics, dispatch);
}
