import type { LinearColor } from '@flighthq/materials';
import { unpackColorToLinear } from '@flighthq/materials';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  VertexColorMaterial,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { VertexColorMaterialKind } from '@flighthq/types';

import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, drawWgpuMeshSubset, writeWgpuFrameUniform } from './wgpuMeshPipeline';
import type { WgpuUnlitDefineKey } from './wgpuUnlitPrelude';
import { bindWgpuUnlitSurface, ensureWgpuUnlitPipeline } from './wgpuUnlitPrelude';

// The built-in VertexColor forward renderer (WgpuMeshMaterialRenderer for VertexColorMaterialKind) —
// the WGSL mirror of vertexColorGlMeshMaterialRenderer. Lighting-independent: renders the material's
// linear tint through the shared unlit pipeline. The canonical 48-byte vertex layout has no color0
// slot on wgpu, so (unlike the GL path) the mesh color0 attribute is not yet multiplied in — the tint
// alone drives the surface until color0 vertex support lands. See registerVertexColorWgpuMaterial.
export const vertexColorWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const vertexColor = material as Readonly<VertexColorMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuUnlitPipeline(state, defineKeyForMaterial(vertexColor), format);
    writeWgpuFrameUniform(state, camera, _lights);

    let group: GPUBindGroup;
    if (vertexColor === null) {
      group = bindWgpuUnlitSurface(state, pipeline, FALLBACK_MATERIAL, WHITE, 1, 0.5);
    } else {
      unpackColorToLinear(_scratch, vertexColor.tint);
      group = bindWgpuUnlitSurface(state, pipeline, vertexColor, _scratch, 1, vertexColor.alphaCutoff);
    }

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Registers the built-in VertexColor renderer for VertexColorMaterialKind on this state. Opt-in (no
// top-level side effect); call once per WgpuRenderState before drawWgpuScene so meshes with
// VertexColorMaterials draw.
export function registerVertexColorWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, VertexColorMaterialKind, vertexColorWgpuMeshMaterialRenderer);
}

function defineKeyForMaterial(material: Readonly<VertexColorMaterial> | null): WgpuUnlitDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    doubleSided: material !== null && material.doubleSided,
    hasColorMap: false,
  };
}

const _scratch: LinearColor = [0, 0, 0, 0];
const WHITE: LinearColor = [1, 1, 1, 1];
const FALLBACK_MATERIAL = {} as Readonly<VertexColorMaterial>;
