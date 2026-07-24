import type { GlLitProgram, GlRenderState, SceneLightBlock, GlMeshProgram } from '@flighthq/types';
import {
  MAX_FORWARD_LIGHTS,
  SCENE_LIGHT_HEMISPHERE_OFFSET,
  SCENE_LIGHT_HEMISPHERE_STRIDE,
  SCENE_LIGHT_POINT_OFFSET,
  SCENE_LIGHT_POINT_STRIDE,
  SCENE_LIGHT_SPOT_OFFSET,
  SCENE_LIGHT_SPOT_STRIDE,
} from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';
// The texture unit the directional shadow map binds to — above the material texture units (a material
// uses at most baseColor/normal/metallicRoughness/occlusion/emissive ⇒ units 0–4). The IBL set sits
// above the shadow map: irradiance/prefiltered cubemaps + the BRDF LUT on units 9/10/11.
const SHADOW_MAP_TEXTURE_UNIT = 8;
const IBL_IRRADIANCE_TEXTURE_UNIT = 9;
const IBL_PREFILTERED_TEXTURE_UNIT = 10;
const IBL_BRDF_TEXTURE_UNIT = 11;

interface GlIblPlaceholders {
  cube: WebGLTexture;
  lut: WebGLTexture;
}

const _iblPlaceholders = new WeakMap<GlRenderState, GlIblPlaceholders>();

// The SceneLightBlock.version last uploaded into each program's light uniforms. Keyed by program
// because default uniforms are per-program state; freed with the program when it is GC'd.
const _uploadedLightVersion = new WeakMap<Readonly<GlLitProgram>, number>();
const _uploadedLightBlock = new WeakMap<Readonly<GlLitProgram>, Readonly<SceneLightBlock>>();

// Uploads the packed light block to a lit program's standard light uniforms, then binds the active
// directional shadow (set by drawGlSceneShadowMap on the scene runtime) or disables shadowing. The
// block layout (std140) mirrors SceneLightBlock.data exactly: directional { direction.xyz @0, _pad,
// radiance.rgb @4, _pad } then ambient { radiance.rgb @8, _pad }. Radiance is already linear and
// premultiplied at pack time. The count uniforms (0 or 1) gate each term. Every lit family calls this
// from bind() — it is the one place light + shadow data reach GL.
export function bindGlMeshLightBlock(
  state: GlRenderState,
  program: Readonly<GlLitProgram>,
  lights: Readonly<SceneLightBlock>,
): void {
  const gl = state.gl;

  // The light uniforms are default (non-block) uniforms, which persist on the program object across
  // useProgram switches and frames, so re-uploading an unchanged block is wasted work. packSceneLightBlock
  // only advances `version` on an actual change, so skip the upload when this program already holds the
  // current version. Tracked per program (not per state) because each program keeps its own uniform
  // values — a version cached on one program says nothing about another. Shadow and IBL binds below are
  // NOT gated: they carry per-frame texture binds that must run every draw regardless of the light block.
  if (_uploadedLightBlock.get(program) !== lights || _uploadedLightVersion.get(program) !== lights.version) {
    const data = lights.data;
    gl.uniform4f(program.locDirectional, data[0], data[1], data[2], 0);
    gl.uniform4f(program.locDirectionalRadiance, data[4], data[5], data[6], 0);
    gl.uniform3f(program.locAmbientRadiance, data[8], data[9], data[10]);
    gl.uniform1f(program.locDirectionalCount, lights.directionalCount);
    gl.uniform1f(program.locAmbientCount, lights.ambientCount);

    // Punctual light arrays: upload the whole MAX_FORWARD_LIGHTS-wide slice as flat vec4 arrays (the
    // shader loops each up to its count uniform). Subarray views over `data` — no copy — sliced at the
    // same std140 offsets the CPU packer wrote. Classic/PBR programs both declare these; a program that
    // resolves a location to null (none does today) simply no-ops the upload.
    gl.uniform4fv(
      program.locPointLights,
      data.subarray(SCENE_LIGHT_POINT_OFFSET, SCENE_LIGHT_POINT_OFFSET + SCENE_LIGHT_POINT_STRIDE * MAX_FORWARD_LIGHTS),
    );
    gl.uniform4fv(
      program.locSpotLights,
      data.subarray(SCENE_LIGHT_SPOT_OFFSET, SCENE_LIGHT_SPOT_OFFSET + SCENE_LIGHT_SPOT_STRIDE * MAX_FORWARD_LIGHTS),
    );
    gl.uniform4fv(
      program.locHemisphereLights,
      data.subarray(
        SCENE_LIGHT_HEMISPHERE_OFFSET,
        SCENE_LIGHT_HEMISPHERE_OFFSET + SCENE_LIGHT_HEMISPHERE_STRIDE * MAX_FORWARD_LIGHTS,
      ),
    );
    gl.uniform1i(program.locPointCount, lights.pointCount);
    gl.uniform1i(program.locSpotCount, lights.spotCount);
    gl.uniform1i(program.locHemisphereCount, lights.hemisphereCount);
    _uploadedLightBlock.set(program, lights);
    _uploadedLightVersion.set(program, lights.version);
  }

  const runtime = getGlSceneRuntime(state);

  const shadow = runtime.shadow;
  if (shadow !== null) {
    gl.activeTexture(gl.TEXTURE0 + SHADOW_MAP_TEXTURE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, shadow.texture);
    gl.uniform1i(program.locShadowMap, SHADOW_MAP_TEXTURE_UNIT);
    gl.uniformMatrix4fv(program.locShadowMatrix, false, shadow.matrix.m);
    gl.uniform1f(program.locShadowEnabled, 1);
  } else {
    gl.uniform1f(program.locShadowEnabled, 0);
  }

  // Image-based lighting (PBR families only; classic/toon programs resolve these locations to null so
  // the binds are harmless no-ops). Bound here so every PBR draw samples the same baked environment.
  const ibl = runtime.ibl;
  if (ibl !== null) {
    gl.activeTexture(gl.TEXTURE0 + IBL_IRRADIANCE_TEXTURE_UNIT);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, ibl.irradianceCube);
    gl.uniform1i(program.locIblIrradiance, IBL_IRRADIANCE_TEXTURE_UNIT);
    gl.activeTexture(gl.TEXTURE0 + IBL_PREFILTERED_TEXTURE_UNIT);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, ibl.prefilteredCube);
    gl.uniform1i(program.locIblPrefiltered, IBL_PREFILTERED_TEXTURE_UNIT);
    gl.activeTexture(gl.TEXTURE0 + IBL_BRDF_TEXTURE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, ibl.brdfLut);
    gl.uniform1i(program.locIblBrdf, IBL_BRDF_TEXTURE_UNIT);
    gl.uniform1f(program.locIblEnabled, 1);
    gl.uniform1f(program.locIblIntensity, ibl.intensity);
    gl.uniform1f(program.locIblMaxMip, ibl.prefilteredMipCount - 1);
    gl.activeTexture(gl.TEXTURE0);
  } else {
    // Even with IBL disabled, the PBR shader still *declares* the cube/2D IBL samplers, and a draw is
    // invalid if a samplerCube and a sampler2D resolve to the same (default) texture unit 0. Bind
    // correctly-typed 1x1 placeholders on the dedicated IBL units so the sampler types never collide
    // with the material's unit-0 sampler — the dynamic u_iblEnabled gate keeps them unsampled.
    const placeholders = ensureGlIblPlaceholders(state);
    gl.activeTexture(gl.TEXTURE0 + IBL_IRRADIANCE_TEXTURE_UNIT);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, placeholders.cube);
    gl.uniform1i(program.locIblIrradiance, IBL_IRRADIANCE_TEXTURE_UNIT);
    gl.activeTexture(gl.TEXTURE0 + IBL_PREFILTERED_TEXTURE_UNIT);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, placeholders.cube);
    gl.uniform1i(program.locIblPrefiltered, IBL_PREFILTERED_TEXTURE_UNIT);
    gl.activeTexture(gl.TEXTURE0 + IBL_BRDF_TEXTURE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, placeholders.lut);
    gl.uniform1i(program.locIblBrdf, IBL_BRDF_TEXTURE_UNIT);
    gl.uniform1f(program.locIblEnabled, 0);
    gl.activeTexture(gl.TEXTURE0);
  }
}

// Lazily creates (and caches per state) the 1x1 placeholder cube + 2D textures bound to the IBL units
// when no environment is baked. They exist only to give the PBR shader's IBL samplers a complete,
// correctly-typed binding so a draw is valid; they are never sampled (the u_iblEnabled gate is 0).
function ensureGlIblPlaceholders(state: GlRenderState): GlIblPlaceholders {
  let placeholders = _iblPlaceholders.get(state);
  if (placeholders !== undefined) return placeholders;

  const gl = state.gl;
  // Create on an IBL unit, never the active unit — the caller has the shadow map bound on unit 8, and
  // binding here on the active unit would clobber it (the "black scene" bug). The else branch rebinds
  // units 9/10/11 with proper activeTexture calls immediately after, so unit choice here only needs to
  // avoid the shadow/material units.
  gl.activeTexture(gl.TEXTURE0 + IBL_IRRADIANCE_TEXTURE_UNIT);
  const black = new Uint8Array([0, 0, 0, 255]);
  const cube = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
  for (let face = 0; face < 6; face++) {
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, black);
  }
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const lut = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, lut);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, black);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  placeholders = { cube, lut };
  _iblPlaceholders.set(state, placeholders);
  return placeholders;
}

// Resolves the standard lit uniform locations from a linked program, so each lit family's compile
// spreads these in rather than repeating the getUniformLocation calls. The names match
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
    locHemisphereCount: gl.getUniformLocation(program, 'u_hemisphereCount'),
    locHemisphereLights: gl.getUniformLocation(program, 'u_hemisphereLights'),
    locIblBrdf: gl.getUniformLocation(program, 'u_iblBrdf'),
    locIblEnabled: gl.getUniformLocation(program, 'u_iblEnabled'),
    locIblIntensity: gl.getUniformLocation(program, 'u_iblIntensity'),
    locIblIrradiance: gl.getUniformLocation(program, 'u_iblIrradiance'),
    locIblMaxMip: gl.getUniformLocation(program, 'u_iblMaxMip'),
    locIblPrefiltered: gl.getUniformLocation(program, 'u_iblPrefiltered'),
    locPointCount: gl.getUniformLocation(program, 'u_pointCount'),
    locPointLights: gl.getUniformLocation(program, 'u_pointLights'),
    locShadowEnabled: gl.getUniformLocation(program, 'u_shadowEnabled'),
    locShadowMap: gl.getUniformLocation(program, 'u_shadowMap'),
    locShadowMatrix: gl.getUniformLocation(program, 'u_shadowMatrix'),
    locSpotCount: gl.getUniformLocation(program, 'u_spotCount'),
    locSpotLights: gl.getUniformLocation(program, 'u_spotLights'),
  };
}

// The GLSL 300 es declaration of the standard forward-light + shadow uniforms and the shared
// shadow-sampling helper, included once in every lit fragment prelude. Keeping it here keeps the GPU
// declaration and the CPU upload (bindGlMeshLightBlock) in lockstep. A lit family that wants shadows
// multiplies its directional contribution by sampleDirectionalShadow(worldPos).
export const GL_MESH_LIGHT_BLOCK_GLSL = `
uniform vec4 u_directional;          // xyz = light travel direction (surface->light is -xyz)
uniform vec4 u_directionalRadiance;  // rgb = linear radiance, premultiplied by intensity
uniform vec3 u_ambientRadiance;      // linear ambient irradiance
uniform float u_directionalCount;    // 0 or 1 — gates the directional term
uniform float u_ambientCount;        // 0 or 1 — gates the ambient term
uniform vec3 u_cameraPosition;       // world-space camera position for view-dependent terms
uniform sampler2D u_shadowMap;       // directional shadow depth map
uniform mat4 u_shadowMatrix;         // world -> shadow light-clip
uniform float u_shadowEnabled;       // 0 or 1 — gates shadow sampling

// Punctual (point/spot/hemisphere) forward-light arrays. Fixed MAX_FORWARD_LIGHTS-wide; each count
// uniform bounds its loop. Layout matches SceneLightBlock.data (packSceneLightBlock) byte-for-byte:
//   point[i]      = u_pointLights[i*2+0]={pos.xyz,range}, [i*2+1]={radiance.rgb,invSqrRange}
//   spot[i]       = u_spotLights[i*4+0..1] as point, [i*4+2]={dir.xyz,_}, [i*4+3]={cosInner,cosOuter,_,_}
//   hemisphere[i] = u_hemisphereLights[i*3+0]={sky.rgb,_}, [i*3+1]={ground.rgb,_}, [i*3+2]={up.xyz,_}
uniform vec4 u_pointLights[MAX_FORWARD_LIGHTS * 2];
uniform vec4 u_spotLights[MAX_FORWARD_LIGHTS * 4];
uniform vec4 u_hemisphereLights[MAX_FORWARD_LIGHTS * 3];
uniform int u_pointCount;
uniform int u_spotCount;
uniform int u_hemisphereCount;

// Smooth inverse-square range window (glTF/UE4): 1 near the light, eased to 0 at the range. invSqrRange
// is 1/range^2 (0 = infinite range, no cutoff). dist2 is the squared surface->light distance.
float rangeWindow(float dist2, float invSqrRange) {
  float factor = dist2 * invSqrRange;
  float windowed = clamp(1.0 - factor * factor, 0.0, 1.0);
  return windowed * windowed;
}

// Directional shadow factor at a world position: 1.0 fully lit, 0.0 fully shadowed, with 3x3 PCF.
// Fragments outside the shadow frustum are treated as lit.
float sampleDirectionalShadow(vec3 worldPos) {
  if (u_shadowEnabled < 0.5) return 1.0;
  vec4 clip = u_shadowMatrix * vec4(worldPos, 1.0);
  vec3 ndc = clip.xyz / clip.w;
  vec3 uvz = ndc * 0.5 + 0.5;
  if (uvz.x < 0.0 || uvz.x > 1.0 || uvz.y < 0.0 || uvz.y > 1.0 || uvz.z > 1.0) return 1.0;
  float current = uvz.z - 0.0025;
  vec2 texel = 1.0 / vec2(textureSize(u_shadowMap, 0));
  float sum = 0.0;
  for (int x = -1; x <= 1; ++x) {
    for (int y = -1; y <= 1; ++y) {
      float closest = texture(u_shadowMap, uvz.xy + vec2(float(x), float(y)) * texel).r;
      sum += current <= closest ? 1.0 : 0.0;
    }
  }
  return sum / 9.0;
}
`;
