import { unpackColorToLinear } from '@flighthq/color';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { LinearColor } from '@flighthq/types';
import type {
  Camera3D,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  StandardPbrMaterial,
  StandardPbrMaterialProperties,
  SurfaceMaterial,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';

import {
  beginWgpuMeshDraw,
  drawWgpuMeshSubset,
  getWgpuMaterialSampler,
  isWgpuTextureReady,
  resolveWgpuMaterialTextureView,
  stashWgpuUvTransform,
  writeWgpuFrameUniform,
} from './wgpuMeshPipeline';
import type { WgpuPbrPipeline } from './wgpuPbrPipelineCache';
import { ensureWgpuPbrPipeline } from './wgpuPbrPipelineCache';
import type { WgpuPbrDefineKey } from './wgpuPbrPrelude';
import type { WgpuMaterialBinding } from './wgpuSceneRuntime';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

// The Material uniform float count (MaterialBlock = 48 floats / 192 bytes). Exported so the extension
// renderers, which write extension factors into the shared scratch through the helpers here, agree on
// the buffer size when they allocate + write their material bind groups.
export const WGPU_PBR_MATERIAL_UNIFORM_FLOATS = 48;

// The shared define key for a PBR material: the alpha-mask cutoff + double-sidedness from the surface
// trailer, the five standard `has*Map` flags derived from the material's bound maps, and every extension
// flag false. StandardPbr passes its own properties (it is a StandardPbrMaterialProperties) as `standard`;
// each extension renderer passes its `material.standard` + surface trailer and then sets exactly one
// extension flag. Keeps the one place that decides the standard flags so the compiled variant and the
// bound resources never disagree. Mirrors scene-gl's buildGlPbrStandardDefineKey.
export function buildWgpuPbrStandardDefineKey(
  standard: Readonly<StandardPbrMaterialProperties> | null,
  surface: Readonly<SurfaceMaterial> | null,
): WgpuPbrDefineKey {
  return {
    alphaMaskEnabled: surface !== null && surface.alphaMode === 'mask',
    anisotropyEnabled: false,
    clearcoatEnabled: false,
    doubleSided: surface !== null && surface.doubleSided,
    hasBaseColorMap: standard !== null && isWgpuTextureReady(standard.baseColorMap),
    hasEmissiveMap: standard !== null && isWgpuTextureReady(standard.emissiveMap),
    hasMetallicRoughnessMap: standard !== null && isWgpuTextureReady(standard.metallicRoughnessMap),
    hasNormalMap: standard !== null && isWgpuTextureReady(standard.normalMap),
    hasOcclusionMap: standard !== null && isWgpuTextureReady(standard.occlusionMap),
    iridescenceEnabled: false,
    sheenEnabled: false,
    specularEnabled: false,
    subsurfaceEnabled: false,
    transmissionEnabled: false,
  };
}

// Allocates (once per material reference) the Material uniform buffer + bind group for a PBR material
// and binds the material's five standard maps (base color, metallic-roughness, normal, occlusion,
// emissive) into the map slots — each resolved to its real uploaded view, or the shared 1x1 placeholder
// when the slot is unbound, so the layout is satisfied either way. The same path serves StandardPbr and
// every extension — the extension factors ride in the one MaterialBlock uniform, so no extra bindings
// are needed. The caller writes `material` (a fresh per-call key for the WeakMap, or the FALLBACK key
// for a null material) into the scratch and uploads it before this returns. The bind group is cached by
// `key`; the resolved views are captured at creation, so a static textured material binds its maps once.
// Returns the bind group to set at group(2).
export function ensureWgpuPbrMaterialBindGroup(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuPbrPipeline>,
  key: object,
  standard: Readonly<StandardPbrMaterialProperties> | null,
): WgpuMaterialBinding {
  const scene = getWgpuSceneRuntime(state);
  let binding: WgpuMaterialBinding | undefined = scene.materialBindGroups.get(key);
  if (binding === undefined) {
    const buffer = state.device.createBuffer({
      size: WGPU_PBR_MATERIAL_UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = state.device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: getWgpuMaterialSampler(state, standard !== null ? standard.baseColorMap : null) },
        {
          binding: 2,
          resource: resolveWgpuMaterialTextureView(state, standard !== null ? standard.baseColorMap : null),
        },
        {
          binding: 3,
          resource: resolveWgpuMaterialTextureView(state, standard !== null ? standard.metallicRoughnessMap : null),
        },
        { binding: 4, resource: resolveWgpuMaterialTextureView(state, standard !== null ? standard.normalMap : null) },
        {
          binding: 5,
          resource: resolveWgpuMaterialTextureView(state, standard !== null ? standard.occlusionMap : null),
        },
        {
          binding: 6,
          resource: resolveWgpuMaterialTextureView(state, standard !== null ? standard.emissiveMap : null),
        },
      ],
    });
    binding = { bindGroup, buffer };
    scene.materialBindGroups.set(key, binding);
  }
  // The base-color map's uv transform drives the shared vertex-stage uv every standard map samples.
  // Runs every bind (standard + each extension routes through here), so the stash is always fresh.
  stashWgpuUvTransform(state, standard !== null ? standard.baseColorMap : null);
  return binding;
}

// Returns the shared MaterialBlock scratch the standard + extension packers write into. The extension
// renderers fill the base block via writeWgpuPbrStandardBlock and their own factors via index into the
// returned array, then upload it. Reused across binds (bind is not a hot inner loop, and one draw is
// recorded before the next bind overwrites it).
export function getWgpuPbrMaterialScratch(): Float32Array {
  return _materialScratch;
}

// Writes the MaterialBlock scratch (192 bytes) into a material binding's uniform buffer. Call after
// writeWgpuPbrStandardBlock + any extension packer has filled the scratch.
export function writeWgpuPbrMaterialUniform(state: WgpuRenderState, binding: Readonly<WgpuMaterialBinding>): void {
  state.device.queue.writeBuffer(binding.buffer, 0, _materialScratch.buffer, 0, WGPU_PBR_MATERIAL_UNIFORM_FLOATS * 4);
}

// Packs the StandardPbr base block (the first 16 floats of the MaterialBlock) into the shared material
// scratch: baseColor.rgba (linear), emissive.rgb*strength, factors (metallic, roughness, normalScale,
// occlusionStrength), flags (alphaCutoff, _, _, _). baseColor/emissive are sRgb-packed and converted to
// linear here so the shader stays in linear space. The extension factor slots (floats 16..47) are left
// to the caller (the extension packers) or zeroed by writeWgpuPbrMaterialBlock for StandardPbr. A null
// block uses neutral defaults (white, dielectric, fully rough). Mirrors scene-gl's bindGlPbrStandardBlock.
export function writeWgpuPbrStandardBlock(
  out: Float32Array,
  standard: Readonly<StandardPbrMaterialProperties> | null,
  alphaCutoff: number,
): void {
  if (standard === null) {
    out[0] = 1;
    out[1] = 1;
    out[2] = 1;
    out[3] = 1;
    out[4] = 0;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 1;
    out[10] = 1;
    out[11] = 1;
    out[12] = alphaCutoff;
    out[13] = 0;
    out[14] = 0;
    out[15] = 0;
    return;
  }

  unpackColorToLinear(_colorScratch, standard.baseColor);
  out[0] = _colorScratch[0];
  out[1] = _colorScratch[1];
  out[2] = _colorScratch[2];
  out[3] = _colorScratch[3];

  unpackColorToLinear(_colorScratch, standard.emissive);
  const strength = standard.emissiveStrength;
  out[4] = _colorScratch[0] * strength;
  out[5] = _colorScratch[1] * strength;
  out[6] = _colorScratch[2] * strength;
  out[7] = 0;

  out[8] = standard.metallic;
  out[9] = standard.roughness;
  out[10] = standard.normalScale;
  out[11] = standard.occlusionStrength;

  out[12] = alphaCutoff;
  out[13] = 0;
  out[14] = 0;
  out[15] = 0;
}

// The built-in StandardPbr forward-lit mesh-material renderer (WgpuMeshMaterialRenderer for
// StandardPbrMaterialKind) — the WGSL mirror of standardPbrGlMeshMaterialRenderer. bind selects the
// pipeline variant for the material's alpha mode / double-sidedness + the current color-attachment
// format (no extension flag), writes the shared Frame uniform (camera view-projection + position, the
// packed light block), binds the pipeline + Frame bind group (beginWgpuMeshDraw), then writes + binds
// the material's uniform/texture bind group at group(2). draw uploads the geometry's GPU buffers lazily
// (cached by geometry.version), writes the per-draw model + normal matrices into the render-state's
// uniform ring buffer (group(1), dynamic offset), and issues the indexed draw over the proxy's subset.
// Depth-test LESS + depth-write on and back-face culling (unless double-sided) are baked on the
// pipeline. The five standard maps (base color, metallic-roughness, normal, occlusion, emissive) are
// sampled when bound — the textured pipeline variant compiles per the `has*Map` flags and the real
// uploaded views bind into the map slots; an unbound slot falls back to the placeholder. See
// registerStandardPbrWgpuMaterial to install it.
//
// Cannot be visually captured in JSDOM (no GPU adapter); the unit test asserts the pipeline/bind/draw
// call shape against the mock device, mirrored against the verified GL result.
export const standardPbrWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const pbr = material as Readonly<StandardPbrMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuPbrPipeline(state, buildWgpuPbrStandardDefineKey(pbr, pbr), format);

    writeWgpuFrameUniform(state, camera, lights);
    const binding = ensureWgpuPbrMaterialBindGroup(state, pipeline, pbr ?? FALLBACK_MATERIAL, pbr);
    writeWgpuPbrStandardBlock(_materialScratch, pbr, pbr !== null ? pbr.alphaCutoff : 0.5);
    _materialScratch.fill(0, 16);
    writeWgpuPbrMaterialUniform(state, binding);

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, binding.bindGroup);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// A StandardPbrMaterial-shaped stand-in used as the material-bind-group cache key when bind is called
// with a null material (the DefaultMaterialKind fallback). Plain neutral PBR defaults; only used for
// identity in the WeakMap.
const FALLBACK_MATERIAL = {} as Readonly<StandardPbrMaterial>;

const _colorScratch: LinearColor = [0, 0, 0, 0];
const _materialScratch = new Float32Array(WGPU_PBR_MATERIAL_UNIFORM_FLOATS);
