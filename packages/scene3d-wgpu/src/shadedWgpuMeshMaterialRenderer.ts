import { unpackColorToLinear } from '@flighthq/color/contract';
import { getWgpuRenderStateRuntime, registerWgpuImageTextureResolver } from '@flighthq/render-wgpu/contract';
import type {
  Camera3D,
  LinearColor,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  ShadedMaterial,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types/contract';
import { ShadedMaterialKind } from '@flighthq/types/contract';

import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, drawWgpuMeshSubset, isWgpuTextureReady, writeWgpuFrameUniform } from './wgpuMeshPipeline';
import { bindWgpuShadedSurface, ensureWgpuShadedPipeline } from './wgpuShadedPrelude';

// The WebGPU ShadedMaterial renderer: selects one composed `shaded:` pipeline from the material's
// ordered modifier feature set, writes the shared frame/light block, then binds the base surface and
// modifier data as one group(2). Its draw half reuses the canonical mesh upload/draw path.
export const shadedWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const pass = getWgpuRenderStateRuntime(state).renderPass;
    if (pass === null) return;

    const shaded = material as Readonly<ShadedMaterial> | null;
    if (shaded === null) return;
    const format = getWgpuRenderStateRuntime(state).currentColorFormat ?? state.format;
    const pipeline = ensureWgpuShadedPipeline(state, shaded, format);
    writeWgpuFrameUniform(state, camera, lights);
    unpackColorToLinear(_diffuse, shaded.diffuse);
    unpackColorToLinear(_specular, shaded.specular);
    const group = bindWgpuShadedSurface(state, pipeline, shaded, _diffuse, _specular);
    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

export function getWgpuShadedBaseFlags(material: Readonly<ShadedMaterial>): {
  alphaMaskEnabled: boolean;
  doubleSided: boolean;
  hasDiffuseMap: boolean;
  hasNormalMap: boolean;
  hasSpecularMap: boolean;
} {
  return {
    alphaMaskEnabled: material.alphaMode === 'mask',
    doubleSided: material.doubleSided,
    hasDiffuseMap: isWgpuTextureReady(material.diffuseMap),
    hasNormalMap: isWgpuTextureReady(material.normalMap),
    hasSpecularMap: isWgpuTextureReady(material.specularMap),
  };
}

// Registers ShadedMaterialKind on one state. Modifier compilers are a separate open registry: call
// registerBuiltInWgpuModifierSnippets (and/or vendor registrations) explicitly before drawing.
export function registerShadedWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuImageTextureResolver(state);
  registerWgpuMeshMaterialRenderer(state, ShadedMaterialKind, shadedWgpuMeshMaterialRenderer);
}

const _diffuse: LinearColor = [0, 0, 0, 0];
const _specular: LinearColor = [0, 0, 0, 0];
