import type { Camera3D } from '@flighthq/camera/contract';
import type { LinearColorRaw } from '@flighthq/color/contract';
import { allocateLinearColor, unpackColorToLinear } from '@flighthq/color/contract';
import type { Scene3DLightBlock } from '@flighthq/lighting/contract';
import type { Material } from '@flighthq/materials/contract';
import type { MeshGeometry } from '@flighthq/meshgeometry/contract';
import {
  getWgpuRenderStateRuntime,
  registerWgpuBitmapTextureResolver,
  registerWgpuImageTextureResolver,
} from '@flighthq/render-wgpu/contract';
import type { WgpuMeshMaterialRenderer, WgpuRenderState } from '@flighthq/render-wgpu/contract';
import type { Scene3DRenderProxy } from '@flighthq/render/contract';
import type { ShadedMaterial } from '@flighthq/shading/contract';
import { ShadedMaterialKind } from '@flighthq/shading/contract';

import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry.ts';
import {
  beginWgpuMeshDraw,
  drawWgpuMeshSubset,
  isWgpuTextureReady,
  writeWgpuFrameUniform,
} from './wgpuMeshPipeline.ts';
import { bindWgpuShadedSurface, ensureWgpuShadedPipeline } from './wgpuShadedPrelude.ts';

// The WebGPU ShadedMaterial renderer: selects one composed `shaded:` pipeline from the material's
// ordered modifier feature set, writes the shared frame/light block, then binds the base surface and
// modifier data as one group(2). Its draw half reuses the canonical mesh upload/draw path.
export const wgpuShadedMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
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
export function registerWgpuShadedMaterial(state: WgpuRenderState): void {
  registerWgpuBitmapTextureResolver(state);
  registerWgpuImageTextureResolver(state);
  registerWgpuMeshMaterialRenderer(state, ShadedMaterialKind, wgpuShadedMeshMaterialRenderer);
}

const _diffuse: LinearColorRaw = allocateLinearColor();
const _specular: LinearColorRaw = allocateLinearColor();
