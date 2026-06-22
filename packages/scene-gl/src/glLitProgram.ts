import type { SceneLightBlock } from '@flighthq/types';

import type { GlMeshProgram } from './glMeshProgram';

// The shared base for every lit mesh-material family (classic Lambert/Phong/BlinnPhong, Toon, and the
// PBR family). Extends GlMeshProgram with the standard forward-light uniform locations every lit
// shader reads: one packed directional + one ambient term from the SceneLightBlock, plus the camera
// world position for view-dependent terms. A family program interface extends GlLitProgram and adds
// its own material uniforms; bindGlMeshLightBlock + resolveGlLitLocations keep the CPU upload and the
// GL_MESH_LIGHT_BLOCK_GLSL declaration the single source of truth for the layout.
export interface GlLitProgram extends GlMeshProgram {
  locAmbientCount: WebGLUniformLocation | null;
  locAmbientRadiance: WebGLUniformLocation | null;
  locCameraPosition: WebGLUniformLocation | null;
  locDirectional: WebGLUniformLocation | null;
  locDirectionalCount: WebGLUniformLocation | null;
  locDirectionalRadiance: WebGLUniformLocation | null;
}

// Uploads the packed light block to a lit program's standard light uniforms. The block layout
// (std140) mirrors SceneLightBlock.data exactly: directional { direction.xyz @0, _pad, radiance.rgb
// @4, _pad } then ambient { radiance.rgb @8, _pad }. Radiance is already linear and premultiplied by
// intensity at pack time, so the shader never decodes sRgb. The count uniforms (0 or 1 today) gate
// each term. Every lit family calls this from bind() — it is the one place light data reaches GL.
export function bindGlMeshLightBlock(
  gl: WebGL2RenderingContext,
  program: Readonly<GlLitProgram>,
  lights: Readonly<SceneLightBlock>,
): void {
  const data = lights.data;
  gl.uniform4f(program.locDirectional, data[0], data[1], data[2], 0);
  gl.uniform4f(program.locDirectionalRadiance, data[4], data[5], data[6], 0);
  gl.uniform3f(program.locAmbientRadiance, data[8], data[9], data[10]);
  gl.uniform1f(program.locDirectionalCount, lights.directionalCount);
  gl.uniform1f(program.locAmbientCount, lights.ambientCount);
}

// Resolves the standard lit uniform locations from a linked program, so each lit family's compile
// spreads these in rather than repeating six getUniformLocation calls. The names match
// GL_MESH_LIGHT_BLOCK_GLSL — change them together.
export function resolveGlLitLocations(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
): Omit<GlLitProgram, keyof GlMeshProgram> {
  return {
    locAmbientCount: gl.getUniformLocation(program, 'u_ambientCount'),
    locAmbientRadiance: gl.getUniformLocation(program, 'u_ambientRadiance'),
    locCameraPosition: gl.getUniformLocation(program, 'u_cameraPosition'),
    locDirectional: gl.getUniformLocation(program, 'u_directional'),
    locDirectionalCount: gl.getUniformLocation(program, 'u_directionalCount'),
    locDirectionalRadiance: gl.getUniformLocation(program, 'u_directionalRadiance'),
  };
}

// The GLSL 300 es declaration of the standard forward-light uniforms, to be included once in every
// lit fragment prelude. Keeping it here keeps the GPU declaration and the CPU upload
// (bindGlMeshLightBlock) in lockstep — a lit family pastes this rather than redeclaring the block.
export const GL_MESH_LIGHT_BLOCK_GLSL = `
uniform vec4 u_directional;          // xyz = light travel direction (surface->light is -xyz)
uniform vec4 u_directionalRadiance;  // rgb = linear radiance, premultiplied by intensity
uniform vec3 u_ambientRadiance;      // linear ambient irradiance
uniform float u_directionalCount;    // 0 or 1 — gates the directional term
uniform float u_ambientCount;        // 0 or 1 — gates the ambient term
uniform vec3 u_cameraPosition;       // world-space camera position for view-dependent terms
`;
