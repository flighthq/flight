import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';

import type { GlContext } from './types.ts';

export interface GlContextState extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly gl: GlContext;
}
