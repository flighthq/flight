import type { LinearColor } from '@flighthq/color';
import { unpackColorToLinear } from '@flighthq/color';
import type {
  Camera,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  VertexColorMaterial,
} from '@flighthq/types';
import { VertexColorMaterialKind } from '@flighthq/types';

import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshViewProjection } from './glMeshProgram';
import { getGlSceneRuntime } from './glSceneRuntime';
import type { GlUnlitDefineKey } from './glUnlitPrelude';
import { bindGlUnlitSurface, ensureGlUnlitProgram } from './glUnlitPrelude';

// The built-in VertexColor forward renderer (GlMeshMaterialRenderer for VertexColorMaterialKind).
// Lighting-independent: the unlit shader's VERTEX_COLOR variant multiplies the mesh's interpolated
// color0 attribute by the linear tint. Geometry without a color0 attribute leaves the attribute
// unbound (its default), so a tinted black surface results — author color0 (or import it via glTF)
// to drive this material. Lights are ignored. See registerVertexColorGlMaterial to install it.
export const vertexColorGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const gl = state.gl;
    const vertexColor = material as Readonly<VertexColorMaterial> | null;
    const program = ensureGlUnlitProgram(state, defineKeyForMaterial(vertexColor));
    beginGlMeshDraw(state, program, vertexColor !== null && vertexColor.doubleSided);
    setGlMeshViewProjection(gl, program.locViewProjection, camera);

    // Default the color0 generic vertex attribute to opaque white so a mesh WITHOUT a color0 attribute
    // renders the tint alone (matching the wgpu path) instead of multiplying by the (0,0,0,1) default,
    // which would render black. A mesh that DOES carry color0 enables the array and overrides this.
    gl.vertexAttrib4f(4, 1, 1, 1, 1);

    if (vertexColor === null) {
      bindGlUnlitSurface(state, program, WHITE, 1, null, 0.5);
      return;
    }
    unpackColorToLinear(scratchRgba, vertexColor.tint);
    bindGlUnlitSurface(state, program, scratchRgba, 1, null, vertexColor.alphaCutoff);
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Registers the built-in VertexColor renderer for VertexColorMaterialKind on this state. Opt-in (no
// top-level side effect); call once per GlRenderState before drawScene so meshes with
// VertexColorMaterials draw.
export function registerVertexColorGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, VertexColorMaterialKind, vertexColorGlMeshMaterialRenderer);
}

function defineKeyForMaterial(material: Readonly<VertexColorMaterial> | null): GlUnlitDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    hasColorMap: false,
    // VertexColor samples no map, so the uv transform never applies.
    hasUvTransform: false,
    vertexColor: true,
  };
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
const WHITE: LinearColor = [1, 1, 1, 1];
