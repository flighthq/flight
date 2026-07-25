import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera3D,
  CustomShaderMaterial,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  WgpuCustomMaterialShaderSource,
  WgpuMeshMaterialRenderer,
  WgpuMeshPipeline,
  WgpuRenderState,
} from '@flighthq/types';
import { CustomShaderMaterialKind } from '@flighthq/types';

import { WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY, WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY } from './wgpuCustomMaterialAbi';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import {
  beginWgpuMeshDraw,
  createWgpuMeshPipeline,
  drawWgpuMeshSubset,
  ensureWgpuPlaceholderTextureView,
  ensureWgpuScenePipeline,
  getWgpuMaterialSampler,
  isWgpuTextureReady,
  resolveWgpuMaterialTextureView,
  stashWgpuUvTransform,
  writeWgpuFrameUniform,
} from './wgpuMeshPipeline';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

export { WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY, WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY } from './wgpuCustomMaterialAbi';

interface CustomMaterialBinding {
  uniformBindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
}

interface CustomMaterialLayouts {
  texture: GPUBindGroupLayout;
  user: GPUBindGroupLayout;
}

// WebGPU's CustomShaderMaterial mesh renderer. The shader is a complete caller-authored WGSL module,
// while scene-wgpu supplies and writes the same fixed Frame group(0) and Draw group(1) used by every
// built-in mesh family. User values occupy group(2); bag-order sampler/texture pairs occupy group(3).
export const customShaderWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const scene = getWgpuSceneRuntime(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const pass = runtime.renderPass;
    const custom = material as Readonly<CustomShaderMaterial> | null;
    if (pass === null || custom === null || custom.shaderKey === '') {
      scene.activeMeshPipeline = null;
      return;
    }

    const source = getWgpuCustomMaterialShaderSource(state, custom.shaderKey);
    if (source === null) {
      scene.activeMeshPipeline = null;
      return;
    }
    scene.customShaderGuard?.(state, custom.shaderKey, source, custom);
    if (
      Object.keys(custom.uniforms ?? {}).length > WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY ||
      Object.keys(custom.textures ?? {}).length > WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY
    ) {
      // Never submit a bind group that cannot satisfy the fixed layout. The opt-in guard above
      // explains the overflow; without guards this follows the renderer's silent skip convention.
      scene.activeMeshPipeline = null;
      return;
    }

    const layouts = ensureCustomMaterialLayouts(state);
    const format = runtime.currentColorFormat ?? state.format;
    const sideKey = custom.doubleSided ? 'double' : 'single';
    const pipeline = ensureWgpuScenePipeline(
      state,
      `custom:${custom.shaderKey}:${format}:${sideKey}`,
      (blended, skinned) =>
        compileCustomMaterialPipeline(state, source, format, custom.doubleSided, blended, skinned, layouts),
    );
    const binding = ensureCustomMaterialBinding(state, custom, layouts.user);
    uploadCustomUniforms(state, binding.uniformBuffer, custom);
    const textureBindGroup = buildCustomTextureBindGroup(state, custom, layouts.texture);

    writeWgpuFrameUniform(state, camera, lights);
    stashWgpuUvTransform(state, null);
    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, binding.uniformBindGroup);
    pass.setBindGroup(3, textureBindGroup);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Returns the WGSL module registered under `shaderKey`, or null when the material should skip drawing.
export function getWgpuCustomMaterialShaderSource(
  state: WgpuRenderState,
  shaderKey: string,
): WgpuCustomMaterialShaderSource | null {
  return _customMaterialShaders.get(state)?.get(shaderKey) ?? null;
}

// Installs CustomShaderMaterialKind in this state's WGPU mesh-material registry.
export function registerCustomShaderWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, CustomShaderMaterialKind, customShaderWgpuMeshMaterialRenderer);
}

// Registers a complete WGSL module for a CustomShaderMaterial shaderKey.
//
// Fixed ABI:
// - group(0)/binding(0): the Frame struct from WGPU_MESH_PRELUDE_WGSL.
// - group(1)/binding(0): the Draw struct from WGPU_MESH_PRELUDE_WGSL (normalMatrix is mat3x3f).
// - group(2)/binding(0): `var<uniform> user : UserBlock`. Declare one vec4f field for each material
//   uniform, in alphabetical field-name order. Scalars use .x; 2/3/4-component values use .xy/.xyz/.xyzw.
// - group(3): the material texture bag in Object.keys order, each slot N declaring its sampler at
//   binding 2*N and texture_2d<f32> at binding 2*N+1.
//
// Entry points are `vs_main` and `fs_main`; attributes use locations 0 position, 1 normal, 2 tangent,
// and 3 uv. Alpha-blended materials must return straight (not premultiplied) fragment alpha. The
// registry follows the GL lifetime rule: last source write wins before compilation, while an already
// compiled shaderKey remains cached; use a new key to compile edited WGSL.
export function registerWgpuCustomMaterialShader(
  state: WgpuRenderState,
  shaderKey: string,
  wgslSource: WgpuCustomMaterialShaderSource,
): void {
  let registry = _customMaterialShaders.get(state);
  if (registry === undefined) {
    registry = new Map();
    _customMaterialShaders.set(state, registry);
  }
  registry.set(shaderKey, wgslSource);
}

function compileCustomMaterialPipeline(
  state: WgpuRenderState,
  source: WgpuCustomMaterialShaderSource,
  format: GPUTextureFormat,
  doubleSided: boolean,
  blended: boolean,
  skinned: boolean,
  layouts: Readonly<CustomMaterialLayouts>,
): WgpuMeshPipeline {
  return createWgpuMeshPipeline(state, {
    blended,
    doubleSided,
    extraBindGroupLayout: layouts.texture,
    format,
    materialBindGroupLayout: layouts.user,
    module: state.device.createShaderModule({ code: source }),
    skinned,
  });
}

function ensureCustomMaterialLayouts(state: WgpuRenderState): CustomMaterialLayouts {
  let layouts = _customMaterialLayouts.get(state);
  if (layouts !== undefined) return layouts;

  const visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  const entries: GPUBindGroupLayoutEntry[] = [];
  for (let slot = 0; slot < WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY; slot++) {
    entries.push({
      binding: slot * 2,
      visibility,
      sampler: { type: 'filtering' },
    });
    entries.push({
      binding: slot * 2 + 1,
      visibility,
      texture: { sampleType: 'float' },
    });
  }
  layouts = {
    texture: state.device.createBindGroupLayout({ entries }),
    user: state.device.createBindGroupLayout({
      entries: [{ binding: 0, visibility, buffer: { type: 'uniform' } }],
    }),
  };
  _customMaterialLayouts.set(state, layouts);
  return layouts;
}

function ensureCustomMaterialBinding(
  state: WgpuRenderState,
  material: Readonly<CustomShaderMaterial>,
  layout: GPUBindGroupLayout,
): CustomMaterialBinding {
  let stateBindings = _customMaterialBindings.get(state);
  if (stateBindings === undefined) {
    stateBindings = new WeakMap();
    _customMaterialBindings.set(state, stateBindings);
  }
  let binding = stateBindings.get(material);
  if (binding !== undefined) return binding;

  const uniformBuffer = state.device.createBuffer({
    size: WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  binding = {
    uniformBindGroup: state.device.createBindGroup({
      layout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    }),
    uniformBuffer,
  };
  stateBindings.set(material, binding);
  return binding;
}

function uploadCustomUniforms(
  state: WgpuRenderState,
  buffer: GPUBuffer,
  material: Readonly<CustomShaderMaterial>,
): void {
  _uniformScratch.fill(0);
  const uniforms = material.uniforms ?? {};
  const names = Object.keys(uniforms).sort();
  const count = Math.min(names.length, WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY);
  for (let slot = 0; slot < count; slot++) {
    const value = uniforms[names[slot]];
    const offset = slot * 4;
    if (typeof value === 'number') {
      _uniformScratch[offset] = value;
      continue;
    }
    const componentCount = Math.min(value.length, 4);
    for (let component = 0; component < componentCount; component++) {
      _uniformScratch[offset + component] = value[component];
    }
  }
  state.device.queue.writeBuffer(buffer, 0, _uniformScratch.buffer, 0, _uniformScratch.byteLength);
}

function buildCustomTextureBindGroup(
  state: WgpuRenderState,
  material: Readonly<CustomShaderMaterial>,
  layout: GPUBindGroupLayout,
): GPUBindGroup {
  const textures = material.textures ?? {};
  const textureNames = Object.keys(textures);

  const placeholder = ensureWgpuPlaceholderTextureView(state);
  const entries: GPUBindGroupEntry[] = [];
  for (let slot = 0; slot < WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY; slot++) {
    const texture = slot < textureNames.length ? textures[textureNames[slot]] : null;
    entries.push({
      binding: slot * 2,
      resource: getWgpuMaterialSampler(state, texture),
    });
    entries.push({
      binding: slot * 2 + 1,
      resource:
        texture !== null && isWgpuTextureReady(texture) ? resolveWgpuMaterialTextureView(state, texture) : placeholder,
    });
  }
  return state.device.createBindGroup({ layout, entries });
}

const _customMaterialShaders = new WeakMap<WgpuRenderState, Map<string, WgpuCustomMaterialShaderSource>>();
const _customMaterialLayouts = new WeakMap<WgpuRenderState, CustomMaterialLayouts>();
const _customMaterialBindings = new WeakMap<WgpuRenderState, WeakMap<object, CustomMaterialBinding>>();
const _uniformScratch = new Float32Array(WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY * 4);
