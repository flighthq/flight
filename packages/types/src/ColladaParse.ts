import type { ColladaElementDecoder } from './ColladaDecoding.ts';
import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { Scene3DDocument } from './Scene3DDocument.ts';
export type ColladaUpAxis = 'X_UP' | 'Y_UP' | 'Z_UP';
export interface ColladaImportOptions {
  readonly baseUrl?: string;
  /**
   * The feature decoders to run, defaulting to every one of them.
   *
   * This is the tree-shaking boundary. Naming a subset is what keeps the packages behind the features a
   * build does not use out of its bundle entirely — a document with no skinning should not pay for
   * controller decoding — and leaving it undefined reproduces the parse this function always did.
   */
  readonly decoders?: readonly ColladaElementDecoder[];
}
export interface ColladaParseResult {
  readonly document: Scene3DDocument;
  readonly diagnostics: ImportDiagnostic[];
  readonly upAxis: ColladaUpAxis;
  readonly rootTransform: readonly number[];
}
