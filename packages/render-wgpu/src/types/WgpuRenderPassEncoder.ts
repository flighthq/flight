import type { WgpuBindGroup } from './WgpuBindGroup.ts';
import type { WgpuBuffer } from './WgpuBuffer.ts';
import type { WgpuIndexFormat, WgpuRenderPipeline } from './WgpuRenderPipeline.ts';
import type { WgpuTexture } from './WgpuTexture.ts';
import type { WgpuTextureView } from './WgpuTextureView.ts';

export type WgpuColor = readonly number[] | Readonly<WgpuColorDict>;

export interface WgpuColorDict {
  a: number;
  b: number;
  g: number;
  r: number;
}

export type WgpuLoadOp = 'clear' | 'load';

export interface WgpuRenderPassColorAttachment {
  clearValue?: WgpuColor;
  depthSlice?: number;
  loadOp: WgpuLoadOp;
  resolveTarget?: WgpuTexture | WgpuTextureView;
  storeOp: WgpuStoreOp;
  view: WgpuTexture | WgpuTextureView;
}

export interface WgpuRenderPassDepthStencilAttachment {
  depthClearValue?: number;
  depthLoadOp?: WgpuLoadOp;
  depthReadOnly?: boolean;
  depthStoreOp?: WgpuStoreOp;
  stencilClearValue?: number;
  stencilLoadOp?: WgpuLoadOp;
  stencilReadOnly?: boolean;
  stencilStoreOp?: WgpuStoreOp;
  view: WgpuTexture | WgpuTextureView;
}

export interface WgpuRenderPassDescriptor {
  colorAttachments: readonly (Readonly<WgpuRenderPassColorAttachment> | null | undefined)[];
  depthStencilAttachment?: Readonly<WgpuRenderPassDepthStencilAttachment>;
  label?: string;
  maxDrawCount?: number;
}

export interface WgpuRenderPassEncoder {
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
  drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number,
  ): void;
  end(): void;
  setBindGroup(index: number, bindGroup: WgpuBindGroup | null, dynamicOffsets?: readonly number[] | Uint32Array): void;
  setIndexBuffer(buffer: WgpuBuffer, indexFormat: WgpuIndexFormat, offset?: number, size?: number): void;
  setPipeline(pipeline: WgpuRenderPipeline): void;
  setScissorRect(x: number, y: number, width: number, height: number): void;
  setStencilReference(reference: number): void;
  setVertexBuffer(slot: number, buffer: WgpuBuffer | null, offset?: number, size?: number): void;
  setViewport(x: number, y: number, width: number, height: number, minDepth: number, maxDepth: number): void;
}

export type WgpuStoreOp = 'discard' | 'store';
