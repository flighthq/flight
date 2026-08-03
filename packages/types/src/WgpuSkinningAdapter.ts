import type { Mesh } from './Mesh';
import type { MeshGeometry } from './MeshGeometry';
import type { WgpuRenderState } from './WgpuRenderState';

export interface WgpuSkinningAdapter {
  extendMeshPrelude(rigidPrelude: string): string;
  extendShadowDepthPrelude(rigidPrelude: string): string;
  getDrawBindGroup(state: WgpuRenderState, jointMatrices: Readonly<Float32Array>): GPUBindGroup;
  getDrawLayout(state: WgpuRenderState): GPUBindGroupLayout;
  getUploadVertices(geometry: Readonly<MeshGeometry>): Float32Array | null;
  hasBindPose(geometry: Readonly<MeshGeometry>): boolean;
  isGpuSkinned(mesh: Readonly<Mesh>): boolean;
  vertexBufferLayouts: readonly GPUVertexBufferLayout[];
}
