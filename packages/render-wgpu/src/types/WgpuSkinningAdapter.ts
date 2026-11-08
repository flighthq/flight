import type { Mesh, MeshGeometry } from '@flighthq/meshgeometry/contract';

import type { WgpuBindGroup } from './WgpuBindGroup.ts';
import type { WgpuBindGroupLayout } from './WgpuBindGroupLayout.ts';
import type { WgpuVertexBufferLayout } from './WgpuRenderPipeline.ts';
import type { WgpuRenderState } from './WgpuRenderState.ts';

export interface WgpuSkinningAdapter {
  extendMeshPrelude(rigidPrelude: string): string;
  extendShadowDepthPrelude(rigidPrelude: string): string;
  getDrawBindGroup(state: WgpuRenderState, jointMatrices: Readonly<Float32Array>): WgpuBindGroup;
  getDrawLayout(state: WgpuRenderState): WgpuBindGroupLayout;
  // The MESH path's pair, carrying the normal palette the shadow path has no use for. Separate rather
  // than widening the two above, so the shadow pipeline is not made to declare a binding it never reads.
  getMeshDrawBindGroup(
    state: WgpuRenderState,
    jointMatrices: Readonly<Float32Array>,
    normalMatrices: Readonly<Float32Array>,
  ): WgpuBindGroup;
  getMeshDrawLayout(state: WgpuRenderState): WgpuBindGroupLayout;
  getUploadVertices(geometry: Readonly<MeshGeometry>): Float32Array | null;
  hasBindPose(geometry: Readonly<MeshGeometry>): boolean;
  isGpuSkinned(mesh: Readonly<Mesh>): boolean;
  vertexBufferLayouts: readonly WgpuVertexBufferLayout[];
}
