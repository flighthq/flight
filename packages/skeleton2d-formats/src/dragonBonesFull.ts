import type { ImportDiagnostic, Skeleton2DImport } from '@flighthq/types/contract';

import { registerAllDragonBonesHandlers } from './dragonBonesHandlers.ts';
import { parseDragonBonesSkeletonWithRegistry } from './dragonBonesParse.ts';
import { createDragonBonesRegistry } from './dragonBonesRegistry.ts';

/**
 * Parses a DragonBones skeleton with every built-in section and timeline handler.
 *
 * ★ SAME SPLIT AS `spineJsonFull.ts`, FOR THE SAME REASON. `dragonBonesParse.ts` declared this wrapper beside
 * `parseDragonBonesSkeletonWithRegistry` and reached the two family registrars directly, so the selective core
 * named both families. Measured, a selective import was 13,060 raw bytes against 47,266 for the full one and
 * carried no registrar and no timeline handler, so the coupling cost nothing — it was a claim the source
 * contradicted, not a bundle a caller paid for.
 *
 * It resolves the families through `registerAllDragonBonesHandlers` rather than calling the two registrars
 * itself. That preset is exactly those two calls in exactly this order, so the resulting registry is
 * unchanged; going through the door means the full set has ONE definition rather than two that can drift.
 */
export function parseDragonBonesSkeleton(json: string, diagnostics?: ImportDiagnostic[]): Skeleton2DImport | null {
  const registry = createDragonBonesRegistry();
  registerAllDragonBonesHandlers(registry);
  return parseDragonBonesSkeletonWithRegistry(json, registry, diagnostics);
}
