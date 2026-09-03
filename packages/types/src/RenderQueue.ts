import type { Entity } from './Entity';
import type { RenderProxy } from './RenderProxy';
export type RenderSortKey = number;
export interface RenderQueueEntry {
  readonly proxy: RenderProxy;
  readonly sortKey: RenderSortKey;
}
export interface RenderQueue extends Entity {
  entries: RenderQueueEntry[];
  entryCount: number;
}
