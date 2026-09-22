import { readFileSync } from 'node:fs';
import { parentPort } from 'node:worker_threads';

import { sdkHostDecompressDeflate } from '@flighthq/compression/contract';
import { createHost } from '@flighthq/host/contract';
import { createScene2DFromSwf, swfAllTagHandlers } from '@flighthq/swf/contract';
import type { ImportDiagnostic } from '@flighthq/types/contract';

import type {
  SwfImportConformanceWorkerRequest,
  SwfImportConformanceWorkerResponse,
} from './swf-import-conformance-worker-protocol';

if (parentPort === null) throw new Error('SWF import conformance worker requires a parent port');

parentPort.on('message', (request: SwfImportConformanceWorkerRequest) => {
  const diagnostics: ImportDiagnostic[] = [];
  let imported = false;
  let threw = false;
  try {
    imported = createScene2DFromSwf(readFileSync(request.path), SWF_PARSE_OPTIONS, diagnostics) !== null;
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

const SWF_PARSE_OPTIONS = {
  host: createHost({ decompress: { deflate: sdkHostDecompressDeflate } }),
  tags: swfAllTagHandlers,
};
