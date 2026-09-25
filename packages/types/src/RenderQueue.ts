import type { Entity } from './Entity.ts';
import type { RenderProxy } from './RenderProxy.ts';
export type RenderSortKey = number;
export interface RenderQueueEntry {
  readonly proxy: RenderProxy;
  readonly sortKey: RenderSortKey;
}
export interface RenderQueue extends Entity {
  entries: RenderQueueEntry[];
  entryCount: number;
}
