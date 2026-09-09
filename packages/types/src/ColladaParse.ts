import type { ImportDiagnostic } from './ImportDiagnostic';
import type { Scene3DDocument } from './Scene3DDocument';
export type ColladaUpAxis = 'X_UP' | 'Y_UP' | 'Z_UP';
export interface ColladaImportOptions {
  readonly baseUrl?: string;
}
export interface ColladaParseResult {
  readonly document: Scene3DDocument;
  readonly diagnostics: ImportDiagnostic[];
  readonly upAxis: ColladaUpAxis;
  readonly rootTransform: readonly number[];
}
