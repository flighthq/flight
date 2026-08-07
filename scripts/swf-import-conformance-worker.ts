import { readFileSync } from 'node:fs';
import { parentPort } from 'node:worker_threads';

import { registerDeflateDecompressor } from '@flighthq/compression/contract';
import { createScene2DFromSwf } from '@flighthq/swf/contract';
import type { ImportDiagnostic } from '@flighthq/types/contract';

import type {
  SwfImportConformanceWorkerRequest,
  SwfImportConformanceWorkerResponse,
} from './swf-import-conformance-worker-protocol';

if (parentPort === null) throw new Error('SWF import conformance worker requires a parent port');

registerDeflateDecompressor();

parentPort.on('message', (request: SwfImportConformanceWorkerRequest) => {
  const diagnostics: ImportDiagnostic[] = [];
  let imported = false;
  let threw = false;
  try {
    imported = createScene2DFromSwf(readFileSync(request.path), diagnostics) !== null;
  } catch {
    threw = true;
  }
  const response: SwfImportConformanceWorkerResponse = {
    observation: {
      diagnostics,
      imported,
      reference: request.reference,
      sourceHash: request.sourceHash,
      threw,
    },
    taskId: request.taskId,
  };
  parentPort!.postMessage(response);
});
