import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { WgpuRenderState } from '@flighthq/types';

import type { WgpuMeshPipeline } from './wgpuMeshPipeline';
import {
  createWgpuMeshPipeline,
  ensureWgpuPlaceholderTextureView,
  ensureWgpuScenePipeline,
  WGPU_MESH_PRELUDE_WGSL,
} from './wgpuMeshPipeline';
import type { WgpuMaterialBinding } from './wgpuSceneRuntime';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

// The shared Wgpu Toon (cel-shading) prelude — the WGSL mirror of scene-gl's glToonPrelude. One module
// source is specialized per material at compile time by a leading const-flag block (WGSL has no
// preprocessor, so each feature flag is emitted as `const FLAG : bool = …;` and the compiler folds the
// dead branch): the base-color-map / ramp / alpha-mask / double-sided variants are flag branches of
// one module, never separate files.
//
// The cel model is deliberately simple: compute the diffuse N·L from the single directional light read
// from the shared Frame uniform (group(0), see WGPU_MESH_PRELUDE_WGSL), then QUANTIZE that term into
// stepped bands by flooring nDotL into `steps` even bands. The banded term modulates the linear base
// color (decoded to linear on the CPU at bind) and the directional radiance; the ambient term is added
// flat. The fragment stage writes LINEAR color (no tonemap / gamma here — the effect pipeline's resolve
// pass owns that), matching the rgba16float scene target. Gate by frame.lightDirection.w (directional
// count) / frame.ambientRadiance.w (ambient count), mirroring standardPbr.
//
// NOTE ON MAPS (baseColorMap, ramp): real map textures are NOT yet sampled on wgpu. The `hasBaseColorMap`
// / `hasRamp` flags stay false on the wgpu renderer; the material bind group binds the shared 1x1
// placeholder in every texture slot so the layout still matches, and the quantizer is always the scalar
// `steps` stepped floor (never a ramp lookup). This mirrors the documented gap on the StandardPbr/Unlit
// wgpu paths: GL works (samples the maps / ramp), wgpu defers until texture upload arrives. The shader's
// HAS_BASE_COLOR_MAP / HAS_RAMP branches are carried so they light up unchanged once upload lands.
//
// Bind groups (must match toonWgpuMeshMaterialRenderer):
//   group(0) Frame    : viewProjection, cameraPosition, directional + ambient light — uniform (shared).
//   group(1) Draw     : world + normalMatrix — uniform (dynamic offset per draw, shared).
//   group(2) Material : toon color/params uniform + sampler + base-color + ramp textures.

// The feature flags that select a Toon uber-shader variant. Each toggles a `const … : bool` in the
// prelude and is hashed into the pipeline-cache key (buildWgpuToonDefineKey), so distinct flag sets
// compile and cache as distinct pipelines. `hasBaseColorMap` enables the sampled albedo tint and
// `hasRamp` switches the quantizer to a 1D ramp lookup — both stay false on the wgpu renderer until
// texture upload lands (see the maps note above); `alphaMaskEnabled` enables the alpha-cutoff discard
// for 'mask' materials; `doubleSided` selects the cull-none pipeline and flips the back-face normal.
export interface WgpuToonDefineKey {
  alphaMaskEnabled: boolean;
  doubleSided: boolean;
  hasBaseColorMap: boolean;
  hasRamp: boolean;
}

// A compiled Toon pipeline variant — a WgpuMeshPipeline (pipeline + group(2) material layout).
export interface WgpuToonPipeline extends WgpuMeshPipeline {}

// Ensures (and caches per material reference) the Toon Material bind group — a uniform buffer + the
// shared sampler + the placeholder base-color and ramp textures — and rewrites its uniform with this
// surface's linear base color, step count, and alpha cutoff. Mirrors scene-gl's bindGlToonMaterialUniforms
// + the wgpu unlit/pbr bind helpers. Returns the bind group for the caller to set at group(2). Maps are
// not sampled yet, so both texture slots bind the shared placeholder (see the prelude maps note).
export function bindWgpuToonSurface(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuToonPipeline>,
  materialKey: object,
  baseColor: Readonly<[number, number, number, number]>,
  steps: number,
  alphaCutoff: number,
): GPUBindGroup {
  const scene = getWgpuSceneRuntime(state);
  let binding: WgpuMaterialBinding | undefined = scene.materialBindGroups.get(materialKey);
  if (binding === undefined) {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const buffer = state.device.createBuffer({
      size: TOON_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const placeholder = ensureWgpuPlaceholderTextureView(state);
    const bindGroup = state.device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: stateRuntime.linearSampler },
        { binding: 2, resource: placeholder },
        { binding: 3, resource: placeholder },
      ],
    });
    binding = { bindGroup, buffer };
    scene.materialBindGroups.set(materialKey, binding);
  }

  _scratch[0] = baseColor[0];
  _scratch[1] = baseColor[1];
  _scratch[2] = baseColor[2];
  _scratch[3] = baseColor[3];
  _scratch[4] = steps;
  _scratch[5] = alphaCutoff;
  _scratch[6] = 0;
  _scratch[7] = 0;
  state.device.queue.writeBuffer(binding.buffer, 0, _scratch.buffer, 0, TOON_UNIFORM_BYTES);
  return binding.bindGroup;
}

// A short, stable, order-independent string identity for a Toon define key, used as the pipeline-cache
// key (combined with the color format). Two keys with the same flags share a compiled pipeline.
export function buildWgpuToonDefineKey(key: Readonly<WgpuToonDefineKey>): string {
  return `${key.alphaMaskEnabled ? 'm' : '-'}${key.doubleSided ? 'd' : '-'}${key.hasBaseColorMap ? 'b' : '-'}${
    key.hasRamp ? 'r' : '-'
  }`;
}

// Compiles the Toon module for a define key and builds the render pipeline for the given color format,
// with the group(2) material bind-group layout (uniform + sampler + base-color + ramp textures). Pure
// GPU work — no caching — used by ensureWgpuToonPipeline.
export function compileWgpuToonPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuToonDefineKey>,
  format: GPUTextureFormat,
): WgpuToonPipeline {
  const device = state.device;
  const module = device.createShaderModule({ code: getWgpuToonModuleSourceForKey(key) });
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });
  return createWgpuMeshPipeline(state, { doubleSided: key.doubleSided, format, materialBindGroupLayout, module });
}

// Resolves the Toon pipeline for a define key + color format, compiling and caching it on first use
// through the shared scene pipeline cache under the `toon:` family namespace.
export function ensureWgpuToonPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuToonDefineKey>,
  format: GPUTextureFormat,
): WgpuToonPipeline {
  return ensureWgpuScenePipeline(state, `toon:${format}|${buildWgpuToonDefineKey(key)}`, () =>
    compileWgpuToonPipeline(state, key, format),
  );
}

// The full WGSL module source for a define key: the const-flag block + the shared mesh prelude (Frame/
// Draw/vs_main/srgbToLinear) + the Toon material block + fs_main.
export function getWgpuToonModuleSourceForKey(key: Readonly<WgpuToonDefineKey>): string {
  return (
    `const ALPHA_MASK : bool = ${key.alphaMaskEnabled ? 'true' : 'false'};\n` +
    `const DOUBLE_SIDED : bool = ${key.doubleSided ? 'true' : 'false'};\n` +
    `const HAS_BASE_COLOR_MAP : bool = ${key.hasBaseColorMap ? 'true' : 'false'};\n` +
    `const HAS_RAMP : bool = ${key.hasRamp ? 'true' : 'false'};\n` +
    WGPU_MESH_PRELUDE_WGSL +
    TOON_WGSL_BODY
  );
}

// Toon material uniform: baseColor vec4f (16) + params vec4f (16) = 32 bytes / 8 floats. params.x =
// steps (band count for the stepped-floor quantizer), params.y = alphaCutoff.
const TOON_UNIFORM_BYTES = 32;

const TOON_WGSL_BODY = /* wgsl */ `
struct ToonMaterial {
  baseColor : vec4f,  // linear rgba
  params : vec4f,     // x = steps, y = alphaCutoff
};

@group(2) @binding(0) var<uniform> material : ToonMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var baseColorTexture : texture_2d<f32>;
@group(2) @binding(3) var rampTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) isFront : bool) -> @location(0) vec4f {
  var baseColor = material.baseColor;
  if (HAS_BASE_COLOR_MAP) {
    let sampled = textureSample(baseColorTexture, materialSampler, in.uv);
    baseColor = vec4f(baseColor.rgb * srgbToLinear(sampled.rgb), baseColor.a * sampled.a);
  }

  if (ALPHA_MASK && baseColor.a < material.params.y) {
    discard;
  }

  var normal = normalize(in.worldNormal);
  // Double-sided materials flip the normal for back faces so both sides shade correctly.
  if (DOUBLE_SIDED && !isFront) {
    normal = -normal;
  }

  var radiance = vec3f(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction). The
  // raw N·L is quantized into cel bands — a 1D ramp lookup when bound, else a stepped floor over steps —
  // then scales the base color and the directional radiance.
  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let nDotL = clamp(dot(normal, lightDir), 0.0, 1.0);
    if (HAS_RAMP) {
      let band = textureSample(rampTexture, materialSampler, vec2f(nDotL, 0.5)).rgb;
      radiance = radiance + baseColor.rgb * band * frame.directionalRadiance.rgb;
    } else {
      let steps = material.params.x;
      let band = floor(nDotL * steps) / max(steps, 1.0);
      radiance = radiance + baseColor.rgb * band * frame.directionalRadiance.rgb;
    }
  }

  // Ambient term: flat irradiance over the base color (unbanded).
  if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + baseColor.rgb * frame.ambientRadiance.rgb;
  }

  return vec4f(radiance, baseColor.a);
}
`;

const _scratch = new Float32Array(TOON_UNIFORM_BYTES / 4);
