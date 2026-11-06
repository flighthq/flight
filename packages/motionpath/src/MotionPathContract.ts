import type { EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';

import type { MotionPathRaw } from './types.ts';

/**
 * Compatibility shape for a finalized motion-path entity.
 *
 * New package contracts should use `MotionPathRaw`; this name preserves the runtime-bearing shape
 * formerly owned by the Types facade without making MotionPath depend on that facade.
 */
export interface MotionPath extends MotionPathRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}
