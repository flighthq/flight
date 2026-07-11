import type { Environment, WgpuRenderState } from '@flighthq/types';

import { ensureWgpuEnvironmentSourceCube } from './wgpuEnvironmentCube';
import type { WgpuSceneIbl } from './wgpuSceneRuntime';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

// Bakes an Environment's source radiance cubemap into the split-sum image-based-lighting set — a diffuse
// irradiance cubemap, a roughness-mipped prefiltered specular cubemap, and the 2D BRDF integration LUT —
// and stores it on the scene runtime as `runtime.ibl`. The lit PBR bind reads that to light every PBR draw
// from the environment (see wgpuPbrPrelude's sampleIblAmbient / the group(4) IBL bind). The WGSL mirror of
// scene-gl's bakeEnvironmentIbl: an explicit pass the app sequences once when the environment is set (the
// bake is the substantial cost); a no-op when the environment has no complete source cube. Re-baking
// replaces the prior set.
//
// Each face (and prefiltered mip) is rendered in its own command encoder + submit so the shared per-face
// uniform (the face direction basis + roughness) is uploaded and consumed pass-by-pass — the WebGPU
// analogue of scene-gl's synchronous per-face FBO renders. Resolutions / sample counts / mip levels mirror
// the GL bake exactly. The BRDF LUT is environment-independent, so it is baked once per state and reused
// across re-bakes.
export function bakeWgpuEnvironmentIbl(state: WgpuRenderState, environment: Readonly<Environment>): void {
  const sourceCubeView = ensureWgpuEnvironmentSourceCube(state, environment);
  if (sourceCubeView === null) return;

  const scene = getWgpuSceneRuntime(state);
  const programs = ensureWgpuBakePrograms(state);
  const sourceBindGroup = state.device.createBindGroup({
    layout: programs.sourceBindGroupLayout,
    entries: [
      { binding: 0, resource: sourceCubeView },
      { binding: 1, resource: programs.sampler },
    ],
  });

  const irradiance = bakeWgpuIrradiance(state, programs, sourceBindGroup);
  const prefiltered = bakeWgpuPrefiltered(state, programs, sourceBindGroup);
  const brdf = scene.ibl?.brdfLut ?? bakeWgpuBrdfLut(state, programs);
  const brdfView = scene.ibl?.brdfLutView ?? brdf.createView();

  // Replace the prior set (its textures are freed by destroyWgpuSceneIbl, not here — a re-bake leaks the
  // old irradiance/prefiltered until teardown, matching scene-gl's re-bake which also relies on teardown).
  const ibl: WgpuSceneIbl = {
    brdfLut: brdf,
    brdfLutView: brdfView,
    intensity: environment.intensity,
    irradianceCube: irradiance.texture,
    irradianceCubeView: irradiance.view,
    prefilteredCube: prefiltered.texture,
    prefilteredCubeView: prefiltered.view,
    prefilteredMipCount: PREFILTERED_MIPS,
  };
  scene.ibl = ibl;
}

// Frees the IBL set's non-GC GPU resources for `state`: the baked irradiance / prefiltered / BRDF textures,
// the uploaded source radiance cube, the IBL uniform buffer, and the 1x1 no-IBL dummies, then clears the
// derived slots (bake pipelines, sampler, sample layout + bind group are GC-managed and left null). The
// WGSL mirror of the IBL branch of scene-gl's destroyGlSceneRuntime + destroyGlBakePrograms. Safe to call
// more than once and when no bake ever ran — every slot is nullable and destroy is idempotent.
export function destroyWgpuSceneIbl(state: WgpuRenderState): void {
  const scene = getWgpuSceneRuntime(state);

  if (scene.ibl !== null) {
    scene.ibl.brdfLut.destroy();
    scene.ibl.irradianceCube.destroy();
    scene.ibl.prefilteredCube.destroy();
    scene.ibl = null;
  }
  if (scene.environmentSourceCube !== null) {
    scene.environmentSourceCube.destroy();
    scene.environmentSourceCube = null;
    scene.environmentSourceCubeView = null;
  }
  if (scene.iblUniformBuffer !== null) {
    scene.iblUniformBuffer.destroy();
    scene.iblUniformBuffer = null;
  }
  if (scene.iblDummyCubeTexture !== null) {
    scene.iblDummyCubeTexture.destroy();
    scene.iblDummyCubeTexture = null;
    scene.iblDummyCubeView = null;
  }
  if (scene.iblDummyLutTexture !== null) {
    scene.iblDummyLutTexture.destroy();
    scene.iblDummyLutTexture = null;
    scene.iblDummyLutView = null;
  }
  scene.iblSampler = null;
  scene.iblSampleLayout = null;
  scene.iblSampleBindGroup = null;
  scene.iblSampleCubeView = null;
  _bakePrograms.delete(state);
}

interface WgpuBakedCube {
  texture: GPUTexture;
  view: GPUTextureView;
}

function bakeWgpuIrradiance(
  state: WgpuRenderState,
  programs: Readonly<WgpuBakePrograms>,
  sourceBindGroup: GPUBindGroup,
): WgpuBakedCube {
  const texture = createWgpuBakeCube(state, IRRADIANCE_SIZE, 1);
  renderWgpuBakeCubeFaces(
    state,
    programs.irradiancePipeline,
    programs,
    texture,
    IRRADIANCE_SIZE,
    0,
    0,
    sourceBindGroup,
  );
  return { texture, view: texture.createView({ dimension: 'cube' }) };
}

function bakeWgpuPrefiltered(
  state: WgpuRenderState,
  programs: Readonly<WgpuBakePrograms>,
  sourceBindGroup: GPUBindGroup,
): WgpuBakedCube {
  const texture = createWgpuBakeCube(state, PREFILTERED_SIZE, PREFILTERED_MIPS);
  for (let mip = 0; mip < PREFILTERED_MIPS; mip++) {
    const mipSize = Math.max(1, PREFILTERED_SIZE >> mip);
    const roughness = PREFILTERED_MIPS > 1 ? mip / (PREFILTERED_MIPS - 1) : 0;
    renderWgpuBakeCubeFaces(
      state,
      programs.prefilteredPipeline,
      programs,
      texture,
      mipSize,
      mip,
      roughness,
      sourceBindGroup,
    );
  }
  return { texture, view: texture.createView({ dimension: 'cube' }) };
}

function bakeWgpuBrdfLut(state: WgpuRenderState, programs: Readonly<WgpuBakePrograms>): GPUTexture {
  const device = state.device;
  const texture = device.createTexture({
    size: [BRDF_LUT_SIZE, BRDF_LUT_SIZE, 1],
    format: IBL_BAKE_FORMAT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: texture.createView(), clearValue: BAKE_CLEAR, loadOp: 'clear', storeOp: 'store' }],
  });
  pass.setPipeline(programs.brdfPipeline);
  pass.draw(3);
  pass.end();
  device.queue.submit([encoder.finish()]);
  return texture;
}

// Renders all six faces of `cube` at mip `mipLevel` (size `size`) through `pipeline`, uploading the
// per-face direction basis (+ roughness) uniform and running one own-encoder submit per face so the shared
// uniform is consumed before the next face overwrites it. Mirrors scene-gl's renderGlBakeCubeFaces.
function renderWgpuBakeCubeFaces(
  state: WgpuRenderState,
  pipeline: GPURenderPipeline,
  programs: Readonly<WgpuBakePrograms>,
  cube: GPUTexture,
  size: number,
  mipLevel: number,
  roughness: number,
  sourceBindGroup: GPUBindGroup,
): void {
  const device = state.device;
  for (let face = 0; face < 6; face++) {
    const b = CUBE_FACE_BASIS[face];
    const u = _bakeScratch;
    u[0] = b[0];
    u[1] = b[1];
    u[2] = b[2];
    u[3] = 0;
    u[4] = b[3];
    u[5] = b[4];
    u[6] = b[5];
    u[7] = 0;
    u[8] = b[6];
    u[9] = b[7];
    u[10] = b[8];
    u[11] = 0;
    u[12] = roughness;
    u[13] = 0;
    u[14] = 0;
    u[15] = 0;
    device.queue.writeBuffer(programs.uniformBuffer, 0, u.buffer, 0, BAKE_UNIFORM_BYTES);

    const view = cube.createView({
      dimension: '2d',
      baseArrayLayer: face,
      arrayLayerCount: 1,
      baseMipLevel: mipLevel,
      mipLevelCount: 1,
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, clearValue: BAKE_CLEAR, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setViewport(0, 0, size, size, 0, 1);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, programs.uniformBindGroup);
    pass.setBindGroup(1, sourceBindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
}

// Allocates a bake-output cube texture (rgba16float, `mips` mip levels) with the full mip chain declared up
// front so each prefiltered roughness level has storage before the bake renders into it. Cube = a 2d
// texture with 6 array layers; the sampleable view is created with dimension 'cube' by the caller.
function createWgpuBakeCube(state: WgpuRenderState, size: number, mips: number): GPUTexture {
  return state.device.createTexture({
    size: [size, size, 6],
    format: IBL_BAKE_FORMAT,
    mipLevelCount: mips,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
}

interface WgpuBakePrograms {
  brdfPipeline: GPURenderPipeline;
  irradiancePipeline: GPURenderPipeline;
  prefilteredPipeline: GPURenderPipeline;
  sampler: GPUSampler;
  sourceBindGroupLayout: GPUBindGroupLayout;
  uniformBindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
}

// Resolves (creating once per state) the three bake pipelines + their shared uniform/source layouts. The
// pipelines and layouts are GC-managed (no destroy); the uniform buffer is freed by destroyWgpuSceneIbl.
// Mirrors scene-gl's ensureGlBakeProgram cache (keyed by state).
function ensureWgpuBakePrograms(state: WgpuRenderState): WgpuBakePrograms {
  let programs = _bakePrograms.get(state);
  if (programs !== undefined) return programs;

  const device = state.device;
  const uniformBindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const sourceBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: 'cube' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });
  const cubeLayout = device.createPipelineLayout({ bindGroupLayouts: [uniformBindGroupLayout, sourceBindGroupLayout] });
  const brdfLayout = device.createPipelineLayout({ bindGroupLayouts: [] });

  const irradianceModule = device.createShaderModule({ code: BAKE_VERTEX_WGSL + IRRADIANCE_FRAGMENT_WGSL });
  const prefilteredModule = device.createShaderModule({ code: BAKE_VERTEX_WGSL + PREFILTERED_FRAGMENT_WGSL });
  const brdfModule = device.createShaderModule({ code: BAKE_VERTEX_WGSL + BRDF_LUT_FRAGMENT_WGSL });

  const uniformBuffer = device.createBuffer({
    size: BAKE_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  programs = {
    brdfPipeline: device.createRenderPipeline({
      layout: brdfLayout,
      vertex: { module: brdfModule, entryPoint: 'vs_main' },
      fragment: { module: brdfModule, entryPoint: 'fs_main', targets: [{ format: IBL_BAKE_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    }),
    irradiancePipeline: device.createRenderPipeline({
      layout: cubeLayout,
      vertex: { module: irradianceModule, entryPoint: 'vs_main' },
      fragment: { module: irradianceModule, entryPoint: 'fs_main', targets: [{ format: IBL_BAKE_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    }),
    prefilteredPipeline: device.createRenderPipeline({
      layout: cubeLayout,
      vertex: { module: prefilteredModule, entryPoint: 'vs_main' },
      fragment: { module: prefilteredModule, entryPoint: 'fs_main', targets: [{ format: IBL_BAKE_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    }),
    sampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }),
    sourceBindGroupLayout,
    uniformBindGroup: device.createBindGroup({
      layout: uniformBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    }),
    uniformBuffer,
  };
  _bakePrograms.set(state, programs);
  return programs;
}

// Mirror scene-gl's bake resolutions / sample counts / mip levels.
const IRRADIANCE_SIZE = 16;
const PREFILTERED_SIZE = 64;
const PREFILTERED_MIPS = 5;
const BRDF_LUT_SIZE = 128;

// The bake output format: rgba16float HDR, matching scene-gl's RGBA16F bake targets (16-bit float is
// core-filterable in WebGPU, so no extra feature is required for the linear cube/LUT sampling).
const IBL_BAKE_FORMAT: GPUTextureFormat = 'rgba16float';

// Per-face bake uniform: faceForward + faceRight + faceUp (3 padded vec3) + roughness = 4 vec4 = 64 bytes.
const BAKE_UNIFORM_BYTES = 64;

const BAKE_CLEAR: GPUColor = { r: 0, g: 0, b: 0, a: 1 };

// Per-face direction basis (forward = face normal, plus right/up spanning the face) in CubeTexture face
// order — identical to scene-gl's CUBE_FACE_BASIS. A fragment's world direction is
// normalize(forward + uv.x*right + uv.y*up) with uv in [-1, 1].
const CUBE_FACE_BASIS: readonly number[][] = [
  [1, 0, 0, 0, 0, -1, 0, -1, 0], // +X
  [-1, 0, 0, 0, 0, 1, 0, -1, 0], // -X
  [0, 1, 0, 1, 0, 0, 0, 0, 1], // +Y
  [0, -1, 0, 1, 0, 0, 0, 0, -1], // -Y
  [0, 0, 1, 1, 0, 0, 0, -1, 0], // +Z
  [0, 0, -1, -1, 0, 0, 0, -1, 0], // -Z
];

const _bakeScratch = new Float32Array(BAKE_UNIFORM_BYTES / 4);
const _bakePrograms = new WeakMap<WgpuRenderState, WgpuBakePrograms>();

// The bake vertex module: a full-screen triangle (from the vertex index) forwarding the [-1,1] face
// coordinate as v_uv so the fragment builds its sampling direction from the per-face basis. v_uv.y is
// NEGATED relative to the clip Y: WebGPU render targets are top-left origin (ndc +Y → framebuffer top),
// where scene-gl's cube-face FBOs are bottom-left, so the negation makes each texel reconstruct the SAME
// direction GL wrote there — keeping the baked cubes vertically aligned with the GL result. (This is the
// single hardest-to-verify orientation choice here; CI's env-ibl parity confirms the sign.)
const BAKE_VERTEX_WGSL = /* wgsl */ `
struct FaceUniform {
  faceForward : vec4f,
  faceRight : vec4f,
  faceUp : vec4f,
  roughness : vec4f,   // x = roughness (prefiltered only)
};
@group(0) @binding(0) var<uniform> face : FaceUniform;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) uv : vec2f,
};

@vertex fn vs_main(@builtin(vertex_index) vi : u32) -> VertexOutput {
  var out : VertexOutput;
  let x = f32((vi & 1u) << 2u) - 1.0;
  let y = f32((vi & 2u) << 1u) - 1.0;
  out.uv = vec2f(x, -y);
  out.clipPosition = vec4f(x, y, 0.0, 1.0);
  return out;
}
`;

// Shared bake fragment helpers (source cube bindings + srgb decode + face direction), the WGSL mirror of
// scene-gl's BAKE_COMMON. The source cube is sampled at level 0 (it has no baked mip chain).
const BAKE_COMMON_WGSL = /* wgsl */ `
const PI : f32 = 3.14159265359;

@group(1) @binding(0) var envCube : texture_cube<f32>;
@group(1) @binding(1) var envSampler : sampler;

fn faceDirection(uv : vec2f) -> vec3f {
  return normalize(face.faceForward.xyz + uv.x * face.faceRight.xyz + uv.y * face.faceUp.xyz);
}

fn srgbToLinear(c : vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow((c + vec3f(0.055)) / 1.055, vec3f(2.4));
  return select(lo, hi, c > vec3f(0.04045));
}

fn radicalInverse(bitsIn : u32) -> f32 {
  var bits = bitsIn;
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return f32(bits) * 2.3283064365386963e-10;
}

fn hammersley(i : u32, n : u32) -> vec2f {
  return vec2f(f32(i) / f32(n), radicalInverse(i));
}

fn importanceSampleGGX(Xi : vec2f, N : vec3f, roughness : f32) -> vec3f {
  let a = roughness * roughness;
  let phi = 2.0 * PI * Xi.x;
  let cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
  let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  let H = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  var up = vec3f(0.0, 0.0, 1.0);
  if (abs(N.z) >= 0.999) {
    up = vec3f(1.0, 0.0, 0.0);
  }
  let tangent = normalize(cross(up, N));
  let bitangent = cross(N, tangent);
  return normalize(tangent * H.x + bitangent * H.y + N * H.z);
}
`;

// Diffuse irradiance: cosine-weighted hemisphere integral of the environment around the texel normal.
const IRRADIANCE_FRAGMENT_WGSL =
  BAKE_COMMON_WGSL +
  /* wgsl */ `
@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  let N = faceDirection(in.uv);
  var up = vec3f(0.0, 0.0, 1.0);
  if (abs(N.z) >= 0.999) {
    up = vec3f(1.0, 0.0, 0.0);
  }
  let right = normalize(cross(up, N));
  let realUp = normalize(cross(N, right));

  var irradiance = vec3f(0.0);
  var samples = 0.0;
  let delta = 0.15;
  var phi = 0.0;
  loop {
    if (phi >= 2.0 * PI) { break; }
    var theta = 0.0;
    loop {
      if (theta >= 0.5 * PI) { break; }
      let tangent = vec3f(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
      let sampleVec = tangent.x * right + tangent.y * realUp + tangent.z * N;
      irradiance = irradiance + srgbToLinear(textureSampleLevel(envCube, envSampler, sampleVec, 0.0).rgb) * cos(theta) * sin(theta);
      samples = samples + 1.0;
      theta = theta + delta;
    }
    phi = phi + delta;
  }
  return vec4f(PI * irradiance / samples, 1.0);
}
`;

// Prefiltered specular: GGX importance-sampled environment for the mip's roughness.
const PREFILTERED_FRAGMENT_WGSL =
  BAKE_COMMON_WGSL +
  /* wgsl */ `
@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  let N = faceDirection(in.uv);
  let V = N;
  let SAMPLE_COUNT = 48u;
  var prefiltered = vec3f(0.0);
  var totalWeight = 0.0;
  for (var i = 0u; i < SAMPLE_COUNT; i = i + 1u) {
    let Xi = hammersley(i, SAMPLE_COUNT);
    let H = importanceSampleGGX(Xi, N, face.roughness.x);
    let L = normalize(2.0 * dot(V, H) * H - V);
    let nDotL = max(dot(N, L), 0.0);
    if (nDotL > 0.0) {
      prefiltered = prefiltered + srgbToLinear(textureSampleLevel(envCube, envSampler, L, 0.0).rgb) * nDotL;
      totalWeight = totalWeight + nDotL;
    }
  }
  if (totalWeight > 0.0) {
    return vec4f(prefiltered / totalWeight, 1.0);
  }
  return vec4f(srgbToLinear(textureSampleLevel(envCube, envSampler, N, 0.0).rgb), 1.0);
}
`;

// BRDF integration LUT (split-sum): x = N·V, y = roughness; output RG = scale/bias for F0. Environment-
// independent (no source cube), so it declares neither the face uniform nor the source cube — just the
// full-screen triangle's uv. The WGSL mirror of scene-gl's BRDF_LUT_FRAGMENT.
const BRDF_LUT_FRAGMENT_WGSL = /* wgsl */ `
const PI : f32 = 3.14159265359;

fn radicalInverse(bitsIn : u32) -> f32 {
  var bits = bitsIn;
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return f32(bits) * 2.3283064365386963e-10;
}

fn hammersley(i : u32, n : u32) -> vec2f {
  return vec2f(f32(i) / f32(n), radicalInverse(i));
}

fn importanceSampleGGX(Xi : vec2f, N : vec3f, roughness : f32) -> vec3f {
  let a = roughness * roughness;
  let phi = 2.0 * PI * Xi.x;
  let cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
  let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  let H = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  var up = vec3f(0.0, 0.0, 1.0);
  if (abs(N.z) >= 0.999) {
    up = vec3f(1.0, 0.0, 0.0);
  }
  let tangent = normalize(cross(up, N));
  let bitangent = cross(N, tangent);
  return normalize(tangent * H.x + bitangent * H.y + N * H.z);
}

fn geometrySchlickGGX(nDotV : f32, roughness : f32) -> f32 {
  let k = roughness * roughness / 2.0;
  return nDotV / (nDotV * (1.0 - k) + k);
}

fn geometrySmith(N : vec3f, V : vec3f, L : vec3f, roughness : f32) -> f32 {
  return geometrySchlickGGX(max(dot(N, L), 0.0), roughness) * geometrySchlickGGX(max(dot(N, V), 0.0), roughness);
}

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  let uv = in.uv * 0.5 + vec2f(0.5);
  let nDotV = max(uv.x, 0.001);
  let roughness = uv.y;
  let V = vec3f(sqrt(1.0 - nDotV * nDotV), 0.0, nDotV);
  let N = vec3f(0.0, 0.0, 1.0);
  var A = 0.0;
  var B = 0.0;
  let SAMPLE_COUNT = 256u;
  for (var i = 0u; i < SAMPLE_COUNT; i = i + 1u) {
    let Xi = hammersley(i, SAMPLE_COUNT);
    let H = importanceSampleGGX(Xi, N, roughness);
    let L = normalize(2.0 * dot(V, H) * H - V);
    let nDotL = max(L.z, 0.0);
    let nDotH = max(H.z, 0.0);
    let vDotH = max(dot(V, H), 0.0);
    if (nDotL > 0.0) {
      let G = geometrySmith(N, V, L, roughness);
      let gVis = (G * vDotH) / (nDotH * nDotV);
      let Fc = pow(1.0 - vDotH, 5.0);
      A = A + (1.0 - Fc) * gVis;
      B = B + Fc * gVis;
    }
  }
  return vec4f(A / f32(SAMPLE_COUNT), B / f32(SAMPLE_COUNT), 0.0, 1.0);
}
`;
