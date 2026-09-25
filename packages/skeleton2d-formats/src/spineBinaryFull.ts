import type { ImportDiagnostic, Skeleton2DImport } from '@flighthq/types/contract';

import { registerAllSpineBinaryHandlers } from './spineBinaryHandlers.ts';
import { parseSpineSkeletonBinaryWithRegistry } from './spineBinaryParse.ts';
import { createSpineBinaryRegistry } from './spineBinaryRegistry.ts';

/** Parses a Spine 4.1 binary with every built-in section and timeline handler. */
export function parseSpineSkeletonBinary(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): Skeleton2DImport | null {
  const registry = createSpineBinaryRegistry();
  registerAllSpineBinaryHandlers(registry);
  return parseSpineSkeletonBinaryWithRegistry(bytes, registry, diagnostics);
}
