import type { RendererData } from '@flighthq/types';

/**
 * Casts `data` to `RendererData` for storage in a renderer's `createData` return value.
 * Use in `createData` implementations to avoid the repeated `as unknown as RendererData` double cast:
 *
 * ```ts
 * function createWgpuFooData(...): RendererData {
 *   return createWgpuRendererData<WgpuFooData>({ ... });
 * }
 * ```
 */
export function createWgpuRendererData<T extends object>(data: T): RendererData {
  return data as unknown as RendererData;
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
export function getWgpuRendererData<T extends object>(data: RendererData | null): T | null {
  return data as unknown as T | null;
}
