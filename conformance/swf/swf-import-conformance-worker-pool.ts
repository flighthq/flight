import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import type { SwfImportConformanceObservation } from './swf-import-conformance-worker-protocol';

export interface SwfImportConformanceWorkerFixture {
  path: string;
  reference: string;
  sourceHash: string;
}

export async function runSwfImportConformanceWorkerPool(
  fixtures: readonly Readonly<SwfImportConformanceWorkerFixture>[],
): Promise<SwfImportConformanceObservation[]> {
  if (fixtures.length === 0) return [];
  const workerCount = Math.min(availableParallelism(), MAX_WORKERS, fixtures.length);
  const observations = new Array<SwfImportConformanceObservation>(fixtures.length);
  const workers: Worker[] = [];
  let next = 0;
  let completed = 0;

  return await new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      for (const worker of workers) void worker.terminate();
      reject(error);
    };
    const assign = (worker: Worker): void => {
      if (next >= fixtures.length) {
        void worker.terminate();
        return;
      }
      const taskId = next++;
      worker.postMessage({ ...fixtures[taskId], taskId });
    };

    for (let index = 0; index < workerCount; index++) {
      const worker = new Worker(join(import.meta.dirname, 'swf-import-conformance-worker.mjs'));
      workers.push(worker);
      worker.on('error', fail);
      worker.on('message', (message: { observation: SwfImportConformanceObservation; taskId: number }) => {
        if (settled) return;
        observations[message.taskId] = message.observation;
        completed++;
        if (completed === fixtures.length) {
          settled = true;
          for (const active of workers) void active.terminate();
          resolve(observations);
          return;
        }
        assign(worker);
      });
      assign(worker);
    }
  });
}

// Each worker loads the complete importer module graph. Sixteen keeps CPU parallelism without turning a
// many-core CI host into hundreds of simultaneous module loads and open fixture descriptors.
const MAX_WORKERS = 16;
