import type { ShapedRun } from './ShapedRun';

export interface TextShaperCache {
  readonly _entries: Map<string, ShapedRun>;
}
