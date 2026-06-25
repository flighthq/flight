import type { WgpuBitmapShader, WgpuRenderState } from '@flighthq/types';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

// Registers a custom bitmap shader as the state-wide default, replacing the built-in quad shader.
// Use this to globally swap the render pipeline (for example a custom color-transform or tint
// shader) on a render state without per-node setWgpuShader bindings.
export function registerWgpuBitmapShader(state: WgpuRenderState, shader: WgpuBitmapShader): void {
  getWgpuRenderStateRuntime(state).defaultBitmapShader = shader;
}
