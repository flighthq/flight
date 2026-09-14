import type { ImportDiagnostic, Skeleton2DImport } from '@flighthq/types/contract';

import { registerAllSpineBinaryHandlers } from './spineBinaryHandlers';
import { parseSpineSkeletonBinaryWithRegistry } from './spineBinaryParse';
import { createSpineBinaryRegistry } from './spineBinaryRegistry';

/** Parses a Spine 4.1 binary with every built-in section and timeline handler. */
export function parseSpineSkeletonBinary(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): Skeleton2DImport | null {
  const registry = createSpineBinaryRegistry();
  registerAllSpineBinaryHandlers(registry);
  return parseSpineSkeletonBinaryWithRegistry(bytes, registry, diagnostics);
}
