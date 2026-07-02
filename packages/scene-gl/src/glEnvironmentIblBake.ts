import type { Environment, GlRenderState } from '@flighthq/types';

import { ensureGlEnvironmentSourceCube, getGlCubeFaceTarget } from './glEnvironmentCube';
import { getGlSceneRuntime } from './glSceneRuntime';

// Bakes an Environment's source radiance cubemap into the split-sum image-based-lighting set —
// a diffuse irradiance cubemap, a roughness-mipped prefiltered specular cubemap, and the 2D BRDF
// integration LUT — and stores it on the scene runtime as `runtime.ibl`. The PBR ambient bind reads
// that to light every PBR draw from the environment (see glPbrPrelude's IBL term). This is an
// explicit pass the app sequences once when the environment is set (the bake is the substantial cost);
// it is a no-op when the environment has no complete source cube. Re-baking replaces the prior set.
//
// Resolutions are deliberately modest (the bake runs in software under the headless capture harness);
// they are the technique, tunable upward for production. The BRDF LUT is environment-independent, so
// it is baked once per state and reused across re-bakes.
export function bakeEnvironmentIbl(state: GlRenderState, environment: Readonly<Environment>): void {
  const sourceCube = ensureGlEnvironmentSourceCube(state, environment);
  if (sourceCube === null) return;

  const gl = state.gl;
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  const runtime = getGlSceneRuntime(state);

  if (runtime.iblBakeFramebuffer === null) runtime.iblBakeFramebuffer = gl.createFramebuffer();
  const fbo = runtime.iblBakeFramebuffer!;

  const prevFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);

  const irradianceCube = bakeGlIrradiance(state, fbo, sourceCube);
  const { prefilteredCube, prefilteredMipCount } = bakeGlPrefiltered(state, fbo, sourceCube);
  const brdfLut = runtime.ibl?.brdfLut ?? bakeGlBrdfLut(state, fbo);

  gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
  gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
  gl.bindVertexArray(null);

  runtime.ibl = {
    brdfLut,
    intensity: environment.intensity,
    irradianceCube,
    prefilteredCube,
    prefilteredMipCount,
  };
}

// Frees the IBL bake shader programs cached for `state` — the irradiance / prefilter / BRDF pass
// programs and each one's fullscreen-quad VAO + vertex buffer. These are module-local (keyed by
// state), so they cannot be reached from the scene runtime; destroyGlSceneRuntime calls this to fold
// them into the one-call teardown. A no-op when no bake has run for the state. The baked result
// textures (runtime.ibl) are freed separately by destroyGlSceneRuntime.
export function destroyGlBakePrograms(state: GlRenderState): void {
  const byState = _bakePrograms.get(state);
  if (byState === undefined) return;
  const gl = state.gl;
  for (const baked of byState.values()) {
    gl.deleteProgram(baked.program);
    gl.deleteVertexArray(baked.vao);
    gl.deleteBuffer(baked.buffer);
  }
  _bakePrograms.delete(state);
}

function bakeGlIrradiance(state: GlRenderState, fbo: WebGLFramebuffer, sourceCube: WebGLTexture): WebGLTexture {
  const gl = state.gl;
  const cube = createGlBakeCube(gl, IRRADIANCE_SIZE, false);
  const program = ensureGlBakeProgram(state, 'irradiance', IRRADIANCE_FRAGMENT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.useProgram(program.program);
  bindGlBakeSourceCube(gl, program, sourceCube);
  renderGlBakeCubeFaces(state, fbo, program, cube, IRRADIANCE_SIZE, 0);
  return cube;
}

function bakeGlPrefiltered(
  state: GlRenderState,
  fbo: WebGLFramebuffer,
  sourceCube: WebGLTexture,
): { prefilteredCube: WebGLTexture; prefilteredMipCount: number } {
  const gl = state.gl;
  const cube = createGlBakeCube(gl, PREFILTERED_SIZE, true);
  const program = ensureGlBakeProgram(state, 'prefiltered', PREFILTERED_FRAGMENT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.useProgram(program.program);
  bindGlBakeSourceCube(gl, program, sourceCube);

  const mipCount = PREFILTERED_MIPS;
  for (let mip = 0; mip < mipCount; mip++) {
    const mipSize = Math.max(1, PREFILTERED_SIZE >> mip);
    const roughness = mipCount > 1 ? mip / (mipCount - 1) : 0;
    gl.uniform1f(program.locRoughness, roughness);
    renderGlBakeCubeFaces(state, fbo, program, cube, mipSize, mip);
  }
  return { prefilteredCube: cube, prefilteredMipCount: mipCount };
}

function bakeGlBrdfLut(state: GlRenderState, fbo: WebGLFramebuffer): WebGLTexture {
  const gl = state.gl;
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // RGBA16F (not RG16F): RG render targets are not reliably color-renderable across drivers (notably
  // headless SwiftShader); the LUT uses only the R/G channels but stores them in a full RGBA target.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, BRDF_LUT_SIZE, BRDF_LUT_SIZE, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const program = ensureGlBakeProgram(state, 'brdf', BRDF_LUT_FRAGMENT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, BRDF_LUT_SIZE, BRDF_LUT_SIZE);
  gl.useProgram(program.program);
  drawGlBakeQuad(state, program);
  return texture;
}

// Renders all six faces of `cube` at mip `mipLevel` (size `size`) through `program`, setting the
// per-face direction basis so the fragment shader reconstructs each texel's world direction.
function renderGlBakeCubeFaces(
  state: GlRenderState,
  fbo: WebGLFramebuffer,
  program: GlBakeProgram,
  cube: WebGLTexture,
  size: number,
  mipLevel: number,
): void {
  const gl = state.gl;
  gl.viewport(0, 0, size, size);
  for (let face = 0; face < 6; face++) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, getGlCubeFaceTarget(gl, face), cube, mipLevel);
    const b = CUBE_FACE_BASIS[face];
    gl.uniform3f(program.locFaceForward, b[0], b[1], b[2]);
    gl.uniform3f(program.locFaceRight, b[3], b[4], b[5]);
    gl.uniform3f(program.locFaceUp, b[6], b[7], b[8]);
    drawGlBakeQuad(state, program);
  }
  void fbo;
}

function createGlBakeCube(gl: WebGL2RenderingContext, size: number, mipped: boolean): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  // Allocate the full mip chain up front: a cube with a mip-aware min filter is "incomplete" (samples
  // as black) until every level it can reach has storage, so each prefiltered roughness level must be
  // texImage2D'd here before the bake renders into it.
  const levels = mipped ? PREFILTERED_MIPS : 1;
  for (let mip = 0; mip < levels; mip++) {
    const mipSize = Math.max(1, size >> mip);
    for (let face = 0; face < 6; face++) {
      gl.texImage2D(getGlCubeFaceTarget(gl, face), mip, gl.RGBA16F, mipSize, mipSize, 0, gl.RGBA, gl.HALF_FLOAT, null);
    }
  }
  const minFilter = mipped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, minFilter);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  if (mipped) gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAX_LEVEL, PREFILTERED_MIPS - 1);
  return texture;
}

function bindGlBakeSourceCube(gl: WebGL2RenderingContext, program: GlBakeProgram, sourceCube: WebGLTexture): void {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, sourceCube);
  gl.uniform1i(program.locEnvCube, 0);
}

interface GlBakeProgram {
  buffer: WebGLBuffer; // the fullscreen-quad vertex buffer bound in the vao; owned here so teardown can free it
  locEnvCube: WebGLUniformLocation | null;
  locFaceForward: WebGLUniformLocation | null;
  locFaceRight: WebGLUniformLocation | null;
  locFaceUp: WebGLUniformLocation | null;
  locRoughness: WebGLUniformLocation | null;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
}

function ensureGlBakeProgram(state: GlRenderState, key: string, fragment: string): GlBakeProgram {
  const gl = state.gl;
  let byState = _bakePrograms.get(state);
  if (byState === undefined) {
    byState = new Map();
    _bakePrograms.set(state, byState);
  }
  let baked = byState.get(key);
  if (baked !== undefined) return baked;

  const program = linkGlBakeProgram(gl, fragment);
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, _quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  baked = {
    buffer,
    locEnvCube: gl.getUniformLocation(program, 'u_envCube'),
    locFaceForward: gl.getUniformLocation(program, 'u_faceForward'),
    locFaceRight: gl.getUniformLocation(program, 'u_faceRight'),
    locFaceUp: gl.getUniformLocation(program, 'u_faceUp'),
    locRoughness: gl.getUniformLocation(program, 'u_roughness'),
    program,
    vao,
  };
  byState.set(key, baked);
  return baked;
}

function drawGlBakeQuad(state: GlRenderState, program: GlBakeProgram): void {
  const gl = state.gl;
  gl.bindVertexArray(program.vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function linkGlBakeProgram(gl: WebGL2RenderingContext, fragment: string): WebGLProgram {
  const vs = compileGlBakeShader(gl, gl.VERTEX_SHADER, BAKE_VERTEX);
  const fs = compileGlBakeShader(gl, gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`scene-gl IBL bake link error: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function compileGlBakeShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`scene-gl IBL bake compile error: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

const IRRADIANCE_SIZE = 16;
const PREFILTERED_SIZE = 64;
const PREFILTERED_MIPS = 5;
const BRDF_LUT_SIZE = 128;

// Per-face direction basis (forward = face normal, plus right/up spanning the face) in CubeTexture
// face order, following the standard cubemap sampling convention (up = -Y on the side/Z faces because
// cube faces store top-left-origin). A fragment's world direction is
// normalize(forward + uv.x*right + uv.y*up) with uv in [-1, 1].
const CUBE_FACE_BASIS: readonly number[][] = [
  [1, 0, 0, 0, 0, -1, 0, -1, 0], // +X
  [-1, 0, 0, 0, 0, 1, 0, -1, 0], // -X
  [0, 1, 0, 1, 0, 0, 0, 0, 1], // +Y
  [0, -1, 0, 1, 0, 0, 0, 0, -1], // -Y
  [0, 0, 1, 1, 0, 0, 0, -1, 0], // +Z
  [0, 0, -1, -1, 0, 0, 0, -1, 0], // -Z
];

const _quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const _bakePrograms = new WeakMap<GlRenderState, Map<string, GlBakeProgram>>();

// The bake vertex shader emits the clip-space quad and forwards the [-1,1] face coordinate so the
// fragment can build its sampling direction from the per-face basis.
const BAKE_VERTEX = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const BAKE_COMMON = `precision highp float;
in vec2 v_uv;
uniform samplerCube u_envCube;
uniform vec3 u_faceForward;
uniform vec3 u_faceRight;
uniform vec3 u_faceUp;
out vec4 fragColor;
const float PI = 3.14159265359;

vec3 faceDirection() {
  return normalize(u_faceForward + v_uv.x * u_faceRight + v_uv.y * u_faceUp);
}
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
`;

// Diffuse irradiance: cosine-weighted hemisphere integral of the environment around the texel normal.
const IRRADIANCE_FRAGMENT = `#version 300 es
${BAKE_COMMON}
void main() {
  vec3 N = faceDirection();
  vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 right = normalize(cross(up, N));
  up = normalize(cross(N, right));

  vec3 irradiance = vec3(0.0);
  float samples = 0.0;
  const float delta = 0.15;
  for (float phi = 0.0; phi < 2.0 * PI; phi += delta) {
    for (float theta = 0.0; theta < 0.5 * PI; theta += delta) {
      vec3 tangent = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
      vec3 sampleVec = tangent.x * right + tangent.y * up + tangent.z * N;
      irradiance += srgbToLinear(texture(u_envCube, sampleVec).rgb) * cos(theta) * sin(theta);
      samples += 1.0;
    }
  }
  fragColor = vec4(PI * irradiance / samples, 1.0);
}
`;

// Prefiltered specular: GGX importance-sampled environment for the mip's roughness.
const PREFILTERED_FRAGMENT = `#version 300 es
${BAKE_COMMON}
uniform float u_roughness;

float radicalInverse(uint bits) {
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return float(bits) * 2.3283064365386963e-10;
}
vec2 hammersley(uint i, uint n) {
  return vec2(float(i) / float(n), radicalInverse(i));
}
vec3 importanceSampleGGX(vec2 Xi, vec3 N, float roughness) {
  float a = roughness * roughness;
  float phi = 2.0 * PI * Xi.x;
  float cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
  float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  vec3 H = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, N));
  vec3 bitangent = cross(N, tangent);
  return normalize(tangent * H.x + bitangent * H.y + N * H.z);
}
void main() {
  vec3 N = faceDirection();
  vec3 V = N;
  const uint SAMPLE_COUNT = 48u;
  vec3 prefiltered = vec3(0.0);
  float totalWeight = 0.0;
  for (uint i = 0u; i < SAMPLE_COUNT; i++) {
    vec2 Xi = hammersley(i, SAMPLE_COUNT);
    vec3 H = importanceSampleGGX(Xi, N, u_roughness);
    vec3 L = normalize(2.0 * dot(V, H) * H - V);
    float nDotL = max(dot(N, L), 0.0);
    if (nDotL > 0.0) {
      prefiltered += srgbToLinear(texture(u_envCube, L).rgb) * nDotL;
      totalWeight += nDotL;
    }
  }
  fragColor = vec4(totalWeight > 0.0 ? prefiltered / totalWeight : srgbToLinear(texture(u_envCube, N).rgb), 1.0);
}
`;

// BRDF integration LUT (split-sum): x = N·V, y = roughness; output RG = scale/bias for F0.
const BRDF_LUT_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
const float PI = 3.14159265359;

float radicalInverse(uint bits) {
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return float(bits) * 2.3283064365386963e-10;
}
vec2 hammersley(uint i, uint n) {
  return vec2(float(i) / float(n), radicalInverse(i));
}
vec3 importanceSampleGGX(vec2 Xi, vec3 N, float roughness) {
  float a = roughness * roughness;
  float phi = 2.0 * PI * Xi.x;
  float cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
  float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  vec3 H = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, N));
  vec3 bitangent = cross(N, tangent);
  return normalize(tangent * H.x + bitangent * H.y + N * H.z);
}
float geometrySchlickGGX(float nDotV, float roughness) {
  float k = roughness * roughness / 2.0;
  return nDotV / (nDotV * (1.0 - k) + k);
}
float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  return geometrySchlickGGX(max(dot(N, L), 0.0), roughness) * geometrySchlickGGX(max(dot(N, V), 0.0), roughness);
}
void main() {
  vec2 uv = v_uv * 0.5 + 0.5;
  float nDotV = max(uv.x, 0.001);
  float roughness = uv.y;
  vec3 V = vec3(sqrt(1.0 - nDotV * nDotV), 0.0, nDotV);
  vec3 N = vec3(0.0, 0.0, 1.0);
  float A = 0.0;
  float B = 0.0;
  const uint SAMPLE_COUNT = 256u;
  for (uint i = 0u; i < SAMPLE_COUNT; i++) {
    vec2 Xi = hammersley(i, SAMPLE_COUNT);
    vec3 H = importanceSampleGGX(Xi, N, roughness);
    vec3 L = normalize(2.0 * dot(V, H) * H - V);
    float nDotL = max(L.z, 0.0);
    float nDotH = max(H.z, 0.0);
    float vDotH = max(dot(V, H), 0.0);
    if (nDotL > 0.0) {
      float G = geometrySmith(N, V, L, roughness);
      float gVis = (G * vDotH) / (nDotH * nDotV);
      float Fc = pow(1.0 - vDotH, 5.0);
      A += (1.0 - Fc) * gVis;
      B += Fc * gVis;
    }
  }
  fragColor = vec4(A / float(SAMPLE_COUNT), B / float(SAMPLE_COUNT), 0.0, 1.0);
}
`;
