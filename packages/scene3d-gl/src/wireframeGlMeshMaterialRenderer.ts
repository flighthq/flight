import { unpackColorToLinear } from '@flighthq/color/contract';
import type {
  LinearColor,
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  WireframeMaterial,
} from '@flighthq/types/contract';
import { WireframeMaterialKind } from '@flighthq/types/contract';

import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import {
  beginGlMeshDraw,
  bindGlMeshSkinPalette,
  setGlMeshViewProjection,
  uploadGlMeshDrawAlpha,
} from './glMeshProgram';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { ensureGlWireframeProgram } from './glWireframePrelude';
import { ensureGlWireframeUpload } from './glWireframeUpload';

// The built-in Wireframe forward renderer (GlMeshMaterialRenderer for WireframeMaterialKind). Draws
// the mesh's triangle edges as GL lines in a single flat linear color. Unlike the triangle families
// it does not use drawGlMeshSubset: draw binds the wireframe line-index VAO (see glWireframeUpload)
// and issues a gl.LINES draw over the subset's derived line range. `thickness` > 1 is not honored —
// WebGL2 fixes line width at 1px on virtually all drivers; the field is documented as best-effort and
// ignored here. Lights are ignored. See registerGlWireframeMaterial to install it.
export const wireframeGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const wireframe = material as Readonly<WireframeMaterial> | null;
    const alphaMaskEnabled = wireframe?.alphaMode === 'mask';
    const program = ensureGlWireframeProgram(state, alphaMaskEnabled);
    // doubleSided = true: lines have no winding, so back-face culling must be off.
    beginGlMeshDraw(state, program, true);
    setGlMeshViewProjection(state, program.locViewProjection, camera);

    if (wireframe === null) {
      gl.uniform4f(program.locColor, 1, 1, 1, 1);
      return;
    }
    unpackColorToLinear(scratchRgba, wireframe.color);
    gl.uniform4f(program.locColor, scratchRgba[0], scratchRgba[1], scratchRgba[2], scratchRgba[3]);
    if (alphaMaskEnabled) gl.uniform1f(program.locAlphaCutoff, wireframe.alphaCutoff);
  },

  draw(state: GlRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const gl = state.gl;
    const program = getGlScene3DRuntime(state).activeMeshProgram;
    if (program === null) return;

    gl.uniformMatrix4fv(program.locModel, false, proxy.worldMatrix.m);
    // This family bypasses drawGlMeshSubset, so it uploads the per-draw object alpha itself.
    uploadGlMeshDrawAlpha(gl, program, proxy.alpha ?? 1, proxy.material);

    const gpuSkinned = bindGlMeshSkinPalette(state, program, proxy);
    const upload = ensureGlWireframeUpload(state, geometry, gpuSkinned);
    const subset = proxy.subset;
    // Each triangle index contributes two line indices, so the subset's line range is its triangle
    // range scaled by 2.
    const elementSize = upload.indexType === gl.UNSIGNED_INT ? 4 : 2;
    gl.drawElements(gl.LINES, subset.indexCount * 2, upload.indexType, subset.indexOffset * 2 * elementSize);
  },
};

// Registers the built-in Wireframe renderer for WireframeMaterialKind on this state. Opt-in (no
// top-level side effect); call once per GlRenderState before drawScene3D so meshes with
// WireframeMaterials draw.
export function registerGlWireframeMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, WireframeMaterialKind, wireframeGlMeshMaterialRenderer);
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
