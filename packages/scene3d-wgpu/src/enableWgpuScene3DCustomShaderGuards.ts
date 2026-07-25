import { logOnce } from '@flighthq/log';
import type { CustomShaderMaterial, WgpuCustomMaterialShaderSource, WgpuRenderState } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

import { WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY, WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY } from './wgpuCustomMaterialAbi';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';

// Returns whether the shakeable CustomShaderMaterial contract guards are installed on `state`.
export function areWgpuScene3DCustomShaderGuardsEnabled(state: WgpuRenderState): boolean {
  return getWgpuScene3DRuntime(state).customShaderGuard != null;
}

// Enables actionable, warn-once diagnostics for the fixed custom-material WGSL binding ABI.
export function enableWgpuScene3DCustomShaderGuards(state: WgpuRenderState): void {
  getWgpuScene3DRuntime(state).customShaderGuard = runWgpuCustomShaderGuards;
}

// Runs the opt-in validation at bind time. Kept as a small exported seam so the renderer carries no
// logging dependency or warning strings unless this guard module is imported and enabled.
export function runWgpuCustomShaderGuards(
  state: WgpuRenderState,
  shaderKey: string,
  source: WgpuCustomMaterialShaderSource,
  material: Readonly<CustomShaderMaterial>,
): void {
  if (getWgpuScene3DRuntime(state).customShaderGuard == null) return;

  const uniforms = material.uniforms ?? {};
  const uniformNames = Object.keys(uniforms).sort();
  for (const name of uniformNames) {
    const value = uniforms[name];
    if (typeof value !== 'number' && (value.length < 1 || value.length > 4)) {
      warn(
        `uniform-length:${shaderKey}:${name}:${value.length}`,
        `shader "${shaderKey}" uniform "${name}" has ${value.length} components; WebGPU custom material uniforms must be scalars or vectors with 1–4 components.`,
      );
    }
  }
  if (uniformNames.length > WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY) {
    warn(
      `uniform-overflow:${shaderKey}`,
      `shader "${shaderKey}" has ${uniformNames.length} uniforms, exceeding the fixed ${WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY}-vec4 UserBlock capacity; extra alphabetically sorted fields are not uploaded.`,
    );
  }

  const textureCount = Object.keys(material.textures ?? {}).length;
  if (textureCount > WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY) {
    warn(
      `texture-overflow:${shaderKey}`,
      `shader "${shaderKey}" has ${textureCount} textures, exceeding the fixed ${WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY}-texture binding capacity; extra bag-order textures are not bound.`,
    );
  }

  const required: [number, number, string][] = [
    [0, 0, 'Frame'],
    [1, 0, 'Draw'],
    [2, 0, 'UserBlock'],
  ];
  for (let slot = 0; slot < Math.min(textureCount, WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY); slot++) {
    required.push([3, slot * 2, `texture sampler slot ${slot}`]);
    required.push([3, slot * 2 + 1, `texture view slot ${slot}`]);
  }
  for (const [group, binding, label] of required) {
    if (hasBinding(source, group, binding)) continue;
    warn(
      `missing-binding:${shaderKey}:${group}:${binding}`,
      `shader "${shaderKey}" is missing reserved @group(${group}) @binding(${binding}) (${label}); declare the fixed scene-wgpu custom material ABI binding.`,
    );
  }
}

function hasBinding(source: string, group: number, binding: number): boolean {
  const groupFirst = new RegExp(
    `@group\\s*\\(\\s*${group}\\s*\\)(?:(?!@group|@binding)[\\s\\S]){0,80}@binding\\s*\\(\\s*${binding}\\s*\\)`,
  );
  const bindingFirst = new RegExp(
    `@binding\\s*\\(\\s*${binding}\\s*\\)(?:(?!@group|@binding)[\\s\\S]){0,80}@group\\s*\\(\\s*${group}\\s*\\)`,
  );
  return groupFirst.test(source) || bindingFirst.test(source);
}

function warn(key: string, message: string): void {
  logOnce(`scene-wgpu:custom-shader:${key}`, LogLevel.Warn, { message }, 'scene-wgpu');
}
