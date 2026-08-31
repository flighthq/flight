import { createEntity } from '@flighthq/entity/contract';
import type { RendererData } from '@flighthq/types/contract';

/**
 * Adds the Entity runtime slot required by `RendererData` to renderer-private state.
 * Use in `createData` implementations so the stored value satisfies the public contract:
 *
 * ```ts
 * function createWgpuFooData(...): RendererData {
 *   return createWgpuRendererData<WgpuFooData>({ ... });
 * }
 * ```
 */
export function createWgpuRendererData<T extends object>(data: T): T & RendererData {
  return createEntity(data);
}

/**
 * Casts `RendererData` back to `T` for reading inside `submit`/`destroyData` implementations.
 * Use in renderer callbacks to avoid the repeated `as unknown as WgpuFooData` double cast:
 *
 * ```ts
 * function drawWgpuFoo(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
 *   const data = getWgpuRendererData<WgpuFooData>(renderProxy.rendererData);
 *   if (data === null) return;
 *   ...
 * }
 * ```
 */
export function getWgpuRendererData<T extends object>(data: RendererData | null): (T & RendererData) | null {
  return data as (T & RendererData) | null;
}
