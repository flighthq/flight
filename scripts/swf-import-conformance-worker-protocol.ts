import type { ImportDiagnostic } from '@flighthq/types/contract';

export interface SwfImportConformanceObservation {
  diagnostics: ImportDiagnostic[];
  imported: boolean;
  reference: string;
  sourceHash: string;
  threw: boolean;
}

export interface SwfImportConformanceWorkerRequest {
  path: string;
  reference: string;
  sourceHash: string;
  taskId: number;
}

export interface SwfImportConformanceWorkerResponse {
  observation: SwfImportConformanceObservation;
  taskId: number;
}
