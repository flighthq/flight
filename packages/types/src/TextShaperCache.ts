import type { Entity } from './Entity';
import type { ShapedRun } from './ShapedRun';

export interface TextShaperCache extends Entity {
  readonly _entries: Map<string, ShapedRun>;
}
