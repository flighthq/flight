import type { EntityRuntime } from './Entity';
import type { Path } from './Path';

export interface LassoSelectionRuntime extends EntityRuntime {
  active: boolean;
  path: Path;
}
