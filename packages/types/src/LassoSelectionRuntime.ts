import type { EntityRuntime } from './Entity.ts';
import type { Path } from './Path.ts';

export interface LassoSelectionRuntime extends EntityRuntime {
  active: boolean;
  path: Path;
}
