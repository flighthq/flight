import {
  registerGlBitmapTextureResolver,
  registerGlImageTextureResolver,
  resolveGlTexture,
} from '@flighthq/render-gl/contract';
import type {
  GlCustomMaterialShaderSource,
  Camera3D,
  CustomShaderMaterial,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  Texture,
  GlMeshProgram,
} from '@flighthq/types/contract';
import { CustomShaderMaterialKind } from '@flighthq/types/contract';

import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import {
  beginGlMeshDraw,
  compileGlProgram,
  drawGlMeshSubset,
  ensureGlScene3DProgram,
  setGlMeshCameraPosition,
  setGlMeshViewProjection,
} from './glMeshProgram';
import { getGlScene3DRuntime } from './glScene3DRuntime';

// A compiled custom-shader program plus its resolved built-in uniform locations. The user's
// custom uniform locations are resolved lazily (getUniformLocation on first use per name) and
// not cached here, because the set of names varies per material instance.
interface GlCustomShaderProgram extends GlMeshProgram {
  locCameraPosition: WebGLUniformLocation | null;
}

// The built-in CustomShaderMaterial forward renderer (GlMeshMaterialRenderer for
// CustomShaderMaterialKind). Looks up the user-registered vertex+fragment source by shaderKey,
// compiles on first use, uploads the four built-in uniforms (u_viewProjection, u_model,
// u_normalMatrix, u_cameraPosition), then iterates the material's custom uniforms and textures.
// A missing shaderKey silently skips (the activeMeshProgram stays null and draw is a no-op),
// matching the sentinel convention used elsewhere in the material registry.
export const customShaderGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const custom = material as Readonly<CustomShaderMaterial> | null;
    if (custom === null || custom.shaderKey === '') {
      getGlScene3DRuntime(state).activeMeshProgram = null;
      return;
    }

    const source = getGlCustomMaterialShaderSource(state, custom.shaderKey);
    if (source === null) {
      getGlScene3DRuntime(state).activeMeshProgram = null;
      return;
    }

    const program = ensureGlCustomShaderProgram(state, custom.shaderKey, source);
    getGlScene3DRuntime(state).customShaderGuard?.(state, program.program, custom.shaderKey);
    beginGlMeshDraw(state, program, custom.doubleSided);
    setGlMeshViewProjection(state, program.locViewProjection, camera);
    setGlMeshCameraPosition(state.gl, program.locCameraPosition, camera);

    uploadCustomShaderMaterialUniforms(state.gl, program.program, custom);
    uploadCustomShaderMaterialTextures(state, program.program, custom);
  },

  draw(state: GlRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlScene3DRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Returns the vertex+fragment source pair registered under `shaderKey` for this state, or null
// when no source is registered. The sentinel null drives the skip-draw path in bind.
export function getGlCustomMaterialShaderSource(
  state: GlRenderState,
  shaderKey: string,
): Readonly<GlCustomMaterialShaderSource> | null {
  return _customMaterialShaders.get(state)?.get(shaderKey) ?? null;
}

// Registers the built-in CustomShaderMaterial renderer for CustomShaderMaterialKind on this
// state. Opt-in (no top-level side effect); call once per GlRenderState before drawScene3D so
// meshes carrying CustomShaderMaterials draw.
export function registerCustomShaderGlMaterial(state: GlRenderState): void {
  registerGlBitmapTextureResolver(state);
  registerGlImageTextureResolver(state);
  registerGlMeshMaterialRenderer(state, CustomShaderMaterialKind, customShaderGlMeshMaterialRenderer);
}

// Registers a vertex + fragment shader source pair under `shaderKey` for this state, so a
// CustomShaderMaterial naming that key compiles and runs it. The vertex scene2d receives the
// standard mesh attributes (a_position loc 0, a_normal loc 1, a_tangent loc 2, a_uv0 loc 3)
// and must declare the four built-in uniforms with these exact types: `mat4 u_viewProjection`,
// `mat4 u_model`, `mat3 u_normalMatrix` (NOT mat4 — the renderer uploads it with glUniformMatrix3fv,
// so a mat4 declaration raises a silent GL_INVALID_OPERATION and the mesh draws nothing;
// enableGlScene3DCustomShaderGuards catches this), and `vec3 u_cameraPosition`. When the material's
// alphaMode is 'blend', drawGlScene3D composites with glBlendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA), so
// the fragment scene2d must output straight (non-premultiplied) alpha. Last write wins for the source
// lookup, but the compiled program is cached
// by shaderKey, so re-registering a different source under the same key keeps running the
// already-compiled program. Register edited source under a new key to force a recompile.
export function registerGlCustomMaterialShader(
  state: GlRenderState,
  shaderKey: string,
  source: Readonly<GlCustomMaterialShaderSource>,
): void {
  let registry = _customMaterialShaders.get(state);
  if (registry === undefined) {
    registry = new Map();
    _customMaterialShaders.set(state, registry);
  }
  registry.set(shaderKey, source);
}
function ensureGlCustomShaderProgram(
  state: GlRenderState,
  shaderKey: string,
  source: Readonly<GlCustomMaterialShaderSource>,
): GlCustomShaderProgram {
  return ensureGlScene3DProgram(state, `custom:${shaderKey}`, (gl) => compileGlCustomShaderProgram(gl, source));
}

function compileGlCustomShaderProgram(
  gl: WebGL2RenderingContext,
  source: Readonly<GlCustomMaterialShaderSource>,
): GlCustomShaderProgram {
  const linked = compileGlProgram(gl, source.vertex, source.fragment);
  return {
    locCameraPosition: gl.getUniformLocation(linked, 'u_cameraPosition'),
    locModel: gl.getUniformLocation(linked, 'u_model'),
    locNormalMatrix: gl.getUniformLocation(linked, 'u_normalMatrix'),
    locViewProjection: gl.getUniformLocation(linked, 'u_viewProjection'),
    program: linked,
  };
}

function uploadCustomShaderMaterialUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  material: Readonly<CustomShaderMaterial>,
): void {
  const uniforms = material.uniforms;
  if (uniforms === null) return;
  for (const name of Object.keys(uniforms)) {
    const location = gl.getUniformLocation(program, name);
    if (location === null) continue;
    const value = uniforms[name];
    if (typeof value === 'number') {
      gl.uniform1f(location, value);
      continue;
    }
    switch (value.length) {
      case 1:
        gl.uniform1f(location, value[0]);
        break;
      case 2:
        gl.uniform2fv(location, value);
        break;
      case 3:
        gl.uniform3fv(location, value);
        break;
      case 4:
        gl.uniform4fv(location, value);
        break;
      default:
        gl.uniform1fv(location, value);
        break;
    }
  }
}

function uploadCustomShaderMaterialTextures(
  state: GlRenderState,
  program: WebGLProgram,
  material: Readonly<CustomShaderMaterial>,
): void {
  const textures = material.textures;
  if (textures === null) return;
  const gl = state.gl;
  let unit = 0;
  for (const name of Object.keys(textures)) {
    const texture: Readonly<Texture> = textures[name];
    const location = gl.getUniformLocation(program, name);
    if (location === null) continue;
    gl.activeTexture(gl.TEXTURE0 + unit);
    if (resolveGlTexture(state, texture) === null) continue;
    gl.uniform1i(location, unit);
    unit++;
  }
}

const _customMaterialShaders = new WeakMap<GlRenderState, Map<string, GlCustomMaterialShaderSource>>();
