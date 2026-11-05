import type { Path } from '@flighthq/path/contract';

import type { EntityRuntime } from './Entity.ts';

export interface LassoSelectionRuntime extends EntityRuntime {
  active: boolean;
  path: Path;
}
