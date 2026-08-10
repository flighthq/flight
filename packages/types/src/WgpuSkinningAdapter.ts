import type { Mesh } from './Mesh';
import type { MeshGeometry } from './MeshGeometry';
import type { WgpuRenderState } from './WgpuRenderState';

export interface WgpuSkinningAdapter {
  extendMeshPrelude(rigidPrelude: string): string;
  extendShadowDepthPrelude(rigidPrelude: string): string;
  getDrawBindGroup(state: WgpuRenderState, jointMatrices: Readonly<Float32Array>): GPUBindGroup;
  getDrawLayout(state: WgpuRenderState): GPUBindGroupLayout;
  // The MESH path's pair, carrying the normal palette the shadow path has no use for. Separate rather
  // than widening the two above, so the shadow pipeline is not made to declare a binding it never reads.
  getMeshDrawBindGroup(
    state: WgpuRenderState,
    jointMatrices: Readonly<Float32Array>,
    normalMatrices: Readonly<Float32Array>,
  ): GPUBindGroup;
  getMeshDrawLayout(state: WgpuRenderState): GPUBindGroupLayout;
  getUploadVertices(geometry: Readonly<MeshGeometry>): Float32Array | null;
  hasBindPose(geometry: Readonly<MeshGeometry>): boolean;
  isGpuSkinned(mesh: Readonly<Mesh>): boolean;
  vertexBufferLayouts: readonly GPUVertexBufferLayout[];
}
