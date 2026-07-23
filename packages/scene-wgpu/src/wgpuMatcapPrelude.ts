import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { LinearColor } from '@flighthq/types';
import type { WgpuRenderState } from '@flighthq/types';

import type { WgpuMeshPipeline } from './wgpuMeshPipeline';
import {
  createWgpuMeshPipeline,
  ensureWgpuPlaceholderTextureView,
  ensureWgpuScenePipeline,
  stashWgpuUvTransform,
  WGPU_MESH_PRELUDE_WGSL,
} from './wgpuMeshPipeline';
import type { WgpuMaterialBinding } from './wgpuSceneRuntime';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

// The shared Wgpu matcap prelude — the WGSL mirror of scene-gl's glMatcapPrelude. One module for the
// lighting-independent Matcap (material-capture) material: a matcap is a prebaked-lit sphere texture
// sampled by the VIEW-SPACE normal projected to 2D (uv = viewNormal.xy * 0.5 + 0.5), giving full
// stylized "lighting" with no scene lights. The output is LINEAR — the sampled matcap rgb would be
// sRgb-decoded in the shader and multiplied by the linear `tint` (already sRgb-decoded on the CPU via
// unpackColorToLinear, so the shader never decodes the tint again). The effect pipeline owns
// tonemap/gamma. WGSL has no preprocessor, so each feature flag is a `const … : bool` the pipeline
// compiler folds (matcap / alpha-mask variants are const-branches of one module, never separate files).
//
// NOTE ON THE MATCAP TEXTURE / VIEW MATRIX: like the StandardPbr and Unlit wgpu paths, real map
// textures are not yet sampled on wgpu (`hasMatcap` stays false; the bind group binds the shared
// placeholder), so the surface renders as the tint alone. The matcap lookup additionally needs the
// camera VIEW matrix to rotate the world-space normal into view space, but the shared Frame uniform
// only carries viewProjection + cameraPosition, not the view matrix. The WGSL therefore derives a
// view-space-normal *approximation* by facing the world normal toward the camera (via
// frame.cameraPosition), kept present-but-unused behind the false `hasMatcap`. Full matcap sampling —
// the true view-space normal and the sampled texture — lands together with wgpu texture upload and a
// view matrix in the Frame uniform. Both mirror documented gaps on the GL side (which works) and let
// the wgpu module stay structurally faithful and compiling in the meantime.

// Ensures (and caches per material reference) the matcap Material bind group — a uniform buffer + the
// shared sampler + the placeholder matcap texture — and rewrites its uniform with this surface's linear
// tint and alpha cutoff. Mirrors scene-gl's bindGlMatcapSurface. Returns the bind group for the caller
// to set at group(2).
export function bindWgpuMatcapSurface(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuMatcapPipeline>,
  materialKey: object,
  tint: Readonly<LinearColor>,
  alphaCutoff: number,
): GPUBindGroup {
  const scene = getWgpuSceneRuntime(state);
  let binding: WgpuMaterialBinding | undefined = scene.materialBindGroups.get(materialKey);
  if (binding === undefined) {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const buffer = state.device.createBuffer({
      size: MATCAP_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = state.device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: stateRuntime.linearSampler },
        { binding: 2, resource: ensureWgpuPlaceholderTextureView(state) },
      ],
    });
    binding = { bindGroup, buffer };
    scene.materialBindGroups.set(materialKey, binding);
  }

  _scratch[0] = tint[0];
  _scratch[1] = tint[1];
  _scratch[2] = tint[2];
  _scratch[3] = tint[3];
  _scratch[4] = alphaCutoff;
  _scratch[5] = 0;
  _scratch[6] = 0;
  _scratch[7] = 0;
  state.device.queue.writeBuffer(binding.buffer, 0, _scratch.buffer, 0, MATCAP_UNIFORM_BYTES);
  // Matcap samples by view-space normal, not a uv map, so stash identity to keep the shared Draw uniform
  // authoritative — a prior tiled material's transform must not persist into this bind.
  stashWgpuUvTransform(state, null);
  return binding.bindGroup;
}

// A short, stable, order-independent string identity for a matcap define key, used as the pipeline-
// cache key (combined with the color format). Two keys with the same flags share a compiled pipeline.
export function buildWgpuMatcapDefineKey(key: Readonly<WgpuMatcapDefineKey>): string {
  return `${key.alphaMaskEnabled ? 'm' : '-'}${key.doubleSided ? 'd' : '-'}${key.hasMatcap ? 't' : '-'}`;
}

// Compiles the matcap module for a define key and builds the render pipeline for the given color
// format, with the group(2) material bind-group layout (uniform + sampler + the matcap texture). Pure
// GPU work — no caching — used by ensureWgpuMatcapPipeline.
export function compileWgpuMatcapPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuMatcapDefineKey>,
  format: GPUTextureFormat,
): WgpuMatcapPipeline {
  const device = state.device;
  const module = device.createShaderModule({ code: getWgpuMatcapModuleSourceForKey(key) });
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });
  return createWgpuMeshPipeline(state, { doubleSided: key.doubleSided, format, materialBindGroupLayout, module });
}

// Resolves the matcap pipeline for a define key + color format, compiling and caching it on first use
// through the shared scene pipeline cache under the `matcap:` family namespace.
export function ensureWgpuMatcapPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuMatcapDefineKey>,
  format: GPUTextureFormat,
): WgpuMatcapPipeline {
  return ensureWgpuScenePipeline(state, `matcap:${format}|${buildWgpuMatcapDefineKey(key)}`, () =>
    compileWgpuMatcapPipeline(state, key, format),
  );
}

// The full WGSL module source for a define key: the const-flag block + the shared mesh prelude (Frame/
// Draw/vs_main/srgbToLinear) + the matcap material block + fs_main.
export function getWgpuMatcapModuleSourceForKey(key: Readonly<WgpuMatcapDefineKey>): string {
  return (
    `const ALPHA_MASK : bool = ${key.alphaMaskEnabled ? 'true' : 'false'};\n` +
    `const HAS_MATCAP : bool = ${key.hasMatcap ? 'true' : 'false'};\n` +
    WGPU_MESH_PRELUDE_WGSL +
    MATCAP_WGSL_BODY
  );
}

// The feature flags that select a matcap variant. `hasMatcap` enables the sampled matcap texture (not
// yet used on wgpu — see prelude note; when false the shader outputs the tint alone); `alphaMaskEnabled`
// enables the alpha-cutoff discard for 'mask' materials; `doubleSided` selects the cull-none pipeline.
export interface WgpuMatcapDefineKey {
  alphaMaskEnabled: boolean;
  doubleSided: boolean;
  hasMatcap: boolean;
}

// A compiled matcap pipeline variant — a WgpuMeshPipeline (pipeline + group(2) material layout).
export interface WgpuMatcapPipeline extends WgpuMeshPipeline {}

// Matcap material uniform: tint vec4f (16) + params vec4f (16) = 32 bytes / 8 floats. tint is linear
// rgba; params.x = alphaCutoff.
const MATCAP_UNIFORM_BYTES = 32;

const MATCAP_WGSL_BODY = /* wgsl */ `
struct MatcapMaterial {
  tint : vec4f,    // linear rgba
  params : vec4f,  // x = alphaCutoff
};

@group(2) @binding(0) var<uniform> material : MatcapMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var matcapTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  var color = material.tint;
  if (HAS_MATCAP) {
    // View-space-normal approximation: the shared Frame uniform carries no view matrix, so face the
    // world normal toward the camera and project to 2D for the matcap lookup (uv = n.xy * 0.5 + 0.5).
    // Present-but-unused while hasMatcap is false; the true view-space normal arrives with a view
    // matrix in Frame + wgpu texture upload.
    let worldNormal = normalize(in.worldNormal);
    let viewDir = normalize(frame.cameraPosition.xyz - in.worldPosition);
    let viewNormal = normalize(reflect(-viewDir, worldNormal));
    let matcapUv = viewNormal.xy * 0.5 + 0.5;
    let sampled = textureSample(matcapTexture, materialSampler, matcapUv);
    color = vec4f(color.rgb * srgbToLinear(sampled.rgb), color.a * sampled.a);
  }
  if (ALPHA_MASK && color.a < material.params.x) {
    discard;
  }
  return color;
}
`;

const _scratch = new Float32Array(MATCAP_UNIFORM_BYTES / 4);
