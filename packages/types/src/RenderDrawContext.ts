import type { BatchFormat } from './BatchFormat';
import type { BlendMode } from './BlendMode';
import type { Kind } from './Entity';
import type { Material } from './Material';
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
