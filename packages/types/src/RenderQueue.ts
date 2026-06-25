import type { RenderProxy } from './RenderProxy';
export type RenderSortKey = number;
export interface RenderQueueEntry {
  readonly proxy: RenderProxy;
  readonly sortKey: RenderSortKey;
}
export interface RenderQueue {
  entries: RenderQueueEntry[];
  entryCount: number;
}
