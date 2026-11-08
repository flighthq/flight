import type { WgpuPipelineLayout } from './WgpuPipelineLayout.ts';
import type { WgpuCompareFunction } from './WgpuSampler.ts';
import type { WgpuShaderModule } from './WgpuShaderModule.ts';
import type { WgpuTextureFormat } from './WgpuTextureFormat.ts';

// Opaque: created by the device and set on a pass, never inspected. On web it is the browser's
// GPURenderPipeline; a native host supplies its own handle.
export type WgpuRenderPipeline = GPURenderPipeline;

export interface WgpuBlendComponent {
  dstFactor?: WgpuBlendFactor;
  operation?: WgpuBlendOperation;
  srcFactor?: WgpuBlendFactor;
}

export type WgpuBlendFactor =
  | 'constant'
  | 'dst'
  | 'dst-alpha'
  | 'one'
  | 'one-minus-constant'
  | 'one-minus-dst'
  | 'one-minus-dst-alpha'
  | 'one-minus-src'
  | 'one-minus-src-alpha'
  | 'one-minus-src1'
  | 'one-minus-src1-alpha'
  | 'src'
  | 'src-alpha'
  | 'src-alpha-saturated'
  | 'src1'
  | 'src1-alpha'
  | 'zero';

export type WgpuBlendOperation = 'add' | 'max' | 'min' | 'reverse-subtract' | 'subtract';

export interface WgpuBlendState {
  alpha: Readonly<WgpuBlendComponent>;
  color: Readonly<WgpuBlendComponent>;
}

export interface WgpuColorTargetState {
  blend?: Readonly<WgpuBlendState>;
  format: WgpuTextureFormat;
  writeMask?: number;
}

// Color channels a target writes, combined with `|`. The numeric values are WGPU's own.
export const WgpuColorWrite = {
  ALL: 0xf,
  ALPHA: 0x8,
  BLUE: 0x4,
  GREEN: 0x2,
  RED: 0x1,
} as const;

export type WgpuCullMode = 'back' | 'front' | 'none';

export interface WgpuDepthStencilState {
  depthBias?: number;
  depthBiasClamp?: number;
  depthBiasSlopeScale?: number;
  depthCompare?: WgpuCompareFunction;
  depthWriteEnabled?: boolean;
  format: WgpuTextureFormat;
  stencilBack?: Readonly<WgpuStencilFaceState>;
  stencilFront?: Readonly<WgpuStencilFaceState>;
  stencilReadMask?: number;
  stencilWriteMask?: number;
}

export interface WgpuFragmentState extends WgpuProgrammableStage {
  targets: readonly (Readonly<WgpuColorTargetState> | null | undefined)[];
}

export type WgpuFrontFace = 'ccw' | 'cw';

export type WgpuIndexFormat = 'uint16' | 'uint32';

export interface WgpuMultisampleState {
  alphaToCoverageEnabled?: boolean;
  count?: number;
  mask?: number;
}

export interface WgpuPrimitiveState {
  cullMode?: WgpuCullMode;
  frontFace?: WgpuFrontFace;
  stripIndexFormat?: WgpuIndexFormat;
  topology?: WgpuPrimitiveTopology;
  unclippedDepth?: boolean;
}

export type WgpuPrimitiveTopology = 'line-list' | 'line-strip' | 'point-list' | 'triangle-list' | 'triangle-strip';

export interface WgpuProgrammableStage {
  constants?: Readonly<Record<string, number>>;
  entryPoint?: string;
  module: WgpuShaderModule;
}

export interface WgpuRenderPipelineDescriptor {
  depthStencil?: Readonly<WgpuDepthStencilState>;
  fragment?: Readonly<WgpuFragmentState>;
  label?: string;
  // `'auto'` derives the layout from the shaders.
  layout: WgpuPipelineLayout | 'auto';
  multisample?: Readonly<WgpuMultisampleState>;
  primitive?: Readonly<WgpuPrimitiveState>;
  vertex: Readonly<WgpuVertexState>;
}

export interface WgpuStencilFaceState {
  compare?: WgpuCompareFunction;
  depthFailOp?: WgpuStencilOperation;
  failOp?: WgpuStencilOperation;
  passOp?: WgpuStencilOperation;
}

export type WgpuStencilOperation =
  | 'decrement-clamp'
  | 'decrement-wrap'
  | 'increment-clamp'
  | 'increment-wrap'
  | 'invert'
  | 'keep'
  | 'replace'
  | 'zero';

export interface WgpuVertexAttribute {
  format: WgpuVertexFormat;
  offset: number;
  shaderLocation: number;
}

export interface WgpuVertexBufferLayout {
  arrayStride: number;
  attributes: readonly Readonly<WgpuVertexAttribute>[];
  stepMode?: WgpuVertexStepMode;
}

export type WgpuVertexFormat =
  | 'float16'
  | 'float16x2'
  | 'float16x4'
  | 'float32'
  | 'float32x2'
  | 'float32x3'
  | 'float32x4'
  | 'sint16'
  | 'sint16x2'
  | 'sint16x4'
  | 'sint32'
  | 'sint32x2'
  | 'sint32x3'
  | 'sint32x4'
  | 'sint8'
  | 'sint8x2'
  | 'sint8x4'
  | 'snorm16'
  | 'snorm16x2'
  | 'snorm16x4'
  | 'snorm8'
  | 'snorm8x2'
  | 'snorm8x4'
  | 'uint16'
  | 'uint16x2'
  | 'uint16x4'
  | 'uint32'
  | 'uint32x2'
  | 'uint32x3'
  | 'uint32x4'
  | 'uint8'
  | 'uint8x2'
  | 'uint8x4'
  | 'unorm10-10-10-2'
  | 'unorm16'
  | 'unorm16x2'
  | 'unorm16x4'
  | 'unorm8'
  | 'unorm8x2'
  | 'unorm8x4'
  | 'unorm8x4-bgra';

export interface WgpuVertexState extends WgpuProgrammableStage {
  buffers?: readonly (Readonly<WgpuVertexBufferLayout> | null | undefined)[];
}

export type WgpuVertexStepMode = 'instance' | 'vertex';
