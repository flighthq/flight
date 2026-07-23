import type { GlMeshProgram } from './GlMeshProgram';

// The shared base for every lit mesh-material family (classic Lambert/Phong/BlinnPhong, Toon, and the
// PBR family). Extends GlMeshProgram with the standard forward-light uniform locations every lit
// shader reads: one packed directional + one ambient term from the SceneLightBlock, the camera world
// position for view-dependent terms, and the directional shadow uniforms. A family program interface
// extends GlLitProgram and adds its own material uniforms; bindGlMeshLightBlock + resolveGlLitLocations
// keep the CPU upload and the GL_MESH_LIGHT_BLOCK_GLSL declaration the single source of truth.
export interface GlLitProgram extends GlMeshProgram {
  locAmbientCount: WebGLUniformLocation | null;
  locAmbientRadiance: WebGLUniformLocation | null;
  locCameraPosition: WebGLUniformLocation | null;
  locDirectional: WebGLUniformLocation | null;
  locDirectionalCount: WebGLUniformLocation | null;
  locDirectionalRadiance: WebGLUniformLocation | null;
  locHemisphereCount: WebGLUniformLocation | null;
  locHemisphereLights: WebGLUniformLocation | null;
  locIblBrdf: WebGLUniformLocation | null;
  locIblEnabled: WebGLUniformLocation | null;
  locIblIntensity: WebGLUniformLocation | null;
  locIblIrradiance: WebGLUniformLocation | null;
  locIblMaxMip: WebGLUniformLocation | null;
  locIblPrefiltered: WebGLUniformLocation | null;
  locPointCount: WebGLUniformLocation | null;
  locPointLights: WebGLUniformLocation | null;
  locShadowEnabled: WebGLUniformLocation | null;
  locShadowMap: WebGLUniformLocation | null;
  locShadowMatrix: WebGLUniformLocation | null;
  locSpotCount: WebGLUniformLocation | null;
  locSpotLights: WebGLUniformLocation | null;
}
