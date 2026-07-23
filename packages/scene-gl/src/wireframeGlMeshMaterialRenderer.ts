import { unpackColorToLinear } from '@flighthq/color';
import type { LinearColor } from '@flighthq/types';
import type {
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  WireframeMaterial,
} from '@flighthq/types';
import { WireframeMaterialKind } from '@flighthq/types';

import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, setGlMeshViewProjection } from './glMeshProgram';
import { getGlSceneRuntime } from './glSceneRuntime';
import { ensureGlWireframeProgram } from './glWireframePrelude';
import { ensureGlWireframeUpload } from './glWireframeUpload';

// The built-in Wireframe forward renderer (GlMeshMaterialRenderer for WireframeMaterialKind). Draws
// the mesh's triangle edges as GL lines in a single flat linear color. Unlike the triangle families
// it does not use drawGlMeshSubset: draw binds the wireframe line-index VAO (see glWireframeUpload)
// and issues a gl.LINES draw over the subset's derived line range. `thickness` > 1 is not honored —
// WebGL2 fixes line width at 1px on virtually all drivers; the field is documented as best-effort and
// ignored here. Lights are ignored. See registerWireframeGlMaterial to install it.
export const wireframeGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const wireframe = material as Readonly<WireframeMaterial> | null;
    const program = ensureGlWireframeProgram(state);
    // doubleSided = true: lines have no winding, so back-face culling must be off.
    beginGlMeshDraw(state, program, true);
    setGlMeshViewProjection(gl, program.locViewProjection, camera);

    if (wireframe === null) {
      gl.uniform4f(program.locColor, 1, 1, 1, 1);
      return;
    }
    unpackColorToLinear(scratchRgba, wireframe.color);
    gl.uniform4f(program.locColor, scratchRgba[0], scratchRgba[1], scratchRgba[2], scratchRgba[3]);
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const gl = state.gl;
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;

    gl.uniformMatrix4fv(program.locModel, false, proxy.worldMatrix.m);

    const upload = ensureGlWireframeUpload(state, geometry);
    const subset = proxy.subset;
    // Each triangle index contributes two line indices, so the subset's line range is its triangle
    // range scaled by 2.
    const elementSize = upload.indexType === gl.UNSIGNED_INT ? 4 : 2;
    gl.drawElements(gl.LINES, subset.indexCount * 2, upload.indexType, subset.indexOffset * 2 * elementSize);
  },
};

// Registers the built-in Wireframe renderer for WireframeMaterialKind on this state. Opt-in (no
// top-level side effect); call once per GlRenderState before drawScene so meshes with
// WireframeMaterials draw.
export function registerWireframeGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, WireframeMaterialKind, wireframeGlMeshMaterialRenderer);
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
