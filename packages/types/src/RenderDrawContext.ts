import type { BatchFormat } from './BatchFormat.ts';
import type { BlendMode } from './BlendMode.ts';
import type { Kind } from './Entity.ts';
import type { Material } from './Material.ts';
export interface RenderBatchKey {
  readonly blend: BlendMode | null;
  readonly format: BatchFormat;
  readonly material: Material | null;
  readonly rendererKind: Kind;
  readonly texture: object | null;
}
export interface RenderDrawContext {
  drawCallCount: number;
  flushCount: number;
  openBatchKey: RenderBatchKey | null;
  proxyVisitedCount: number;
}
