import type { ImportDiagnostic, Skeleton2DImport } from '@flighthq/types/contract';

import { registerAllSpineJsonHandlers } from './spineJsonHandlers.ts';
import { createSpineJsonRegistry } from './spineJsonRegistry.ts';
import { parseSpineSkeletonWithRegistry } from './spineParse.ts';

/**
 * Parses a Spine JSON skeleton with every built-in section and timeline handler.
 *
 * ★ THIS MODULE EXISTS SO THE SELECTIVE CORE CAN NAME NO PRESET. `spineParse.ts` used to declare this wrapper
 * beside `parseSpineSkeletonWithRegistry`, so the module whose entire purpose is parsing with the registry it
 * is GIVEN named `registerAllSpineJsonHandlers`. esbuild shook that reference out — a selective import measured
 * 9,098 raw bytes against 43,027 for the full one, carrying neither the preset nor any section handler — so it
 * cost nothing; but a source-level claim cannot be gated while it is false, and the reference was one reachable
 * edge from putting every family into the graph of a caller who had declined them.
 *
 * Its Spine Binary sibling, `spineBinaryFull.ts`, has always had this shape. This is the last format to get it.
 */
export function parseSpineSkeleton(json: string, diagnostics?: ImportDiagnostic[]): Skeleton2DImport | null {
  const registry = createSpineJsonRegistry();
  registerAllSpineJsonHandlers(registry);
  return parseSpineSkeletonWithRegistry(json, registry, diagnostics);
}
