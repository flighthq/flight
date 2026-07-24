import type { LinearColor, WgpuMaterialBinding, WgpuRenderState, WgpuWireframePipeline } from '@flighthq/types';

import {
  createWgpuMeshPipeline,
  ensureWgpuScenePipeline,
  stashWgpuUvTransform,
  WGPU_MESH_PRELUDE_WGSL,
} from './wgpuMeshPipeline';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

// The Wgpu wireframe prelude — the WGSL mirror of scene-gl's glWireframePrelude. A minimal module that
// reuses the shared vs_main (position → clip) and outputs a single flat LINE color; the wireframe
// material draws mesh edges as GL line-list primitives (see wgpuWireframeUpload for the derived
// line-index buffer). It has no lighting, no maps, and one variant per color format — group(2) carries
// only the color uniform. The pipeline is built with line-list topology and cull-none.
// Ensures (and caches per material reference) the wireframe color bind group — a single uniform buffer
// — and rewrites it with this material's linear line color. Mirrors scene-gl's wireframe color upload.
export function bindWgpuWireframeColor(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuWireframePipeline>,
  materialKey: object,
  color: Readonly<LinearColor>,
): GPUBindGroup {
  const scene = getWgpuSceneRuntime(state);
  let binding: WgpuMaterialBinding | undefined = scene.materialBindGroups.get(materialKey);
  if (binding === undefined) {
    const buffer = state.device.createBuffer({
      size: WIREFRAME_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = state.device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer } }],
    });
    binding = { bindGroup, buffer };
    scene.materialBindGroups.set(materialKey, binding);
  }

  _scratch[0] = color[0];
  _scratch[1] = color[1];
  _scratch[2] = color[2];
  _scratch[3] = color[3];
  state.device.queue.writeBuffer(binding.buffer, 0, _scratch.buffer, 0, WIREFRAME_UNIFORM_BYTES);
  // Wireframe draws untextured lines, so stash identity to keep the shared Draw uniform authoritative —
  // a prior tiled material's transform must not persist into this bind.
  stashWgpuUvTransform(state, null);
  return binding.bindGroup;
}

// Compiles the wireframe module and builds the line-list render pipeline for the given color format,
// with a group(2) material layout carrying just the color uniform. Cull-none (lines have no winding).
// Pure GPU work — no caching — used by ensureWgpuWireframePipeline.
export function compileWgpuWireframePipeline(
  state: WgpuRenderState,
  format: GPUTextureFormat,
  blended = false,
): WgpuWireframePipeline {
  const device = state.device;
  const module = device.createShaderModule({ code: getWgpuWireframeModuleSource() });
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  return createWgpuMeshPipeline(state, {
    blended,
    doubleSided: true,
    format,
    materialBindGroupLayout,
    module,
    topology: 'line-list',
  });
}

// Resolves the wireframe pipeline for a color format, compiling and caching it on first use through the
// shared scene pipeline cache under the `wireframe:` family namespace.
export function ensureWgpuWireframePipeline(state: WgpuRenderState, format: GPUTextureFormat): WgpuWireframePipeline {
  return ensureWgpuScenePipeline(state, `wireframe:${format}`, (blended) =>
    compileWgpuWireframePipeline(state, format, blended),
  );
}

// The full WGSL module source: the shared mesh prelude (Frame/Draw/vs_main/srgbToLinear) + the
// wireframe color uniform + fs_main.
export function getWgpuWireframeModuleSource(): string {
  return WGPU_MESH_PRELUDE_WGSL + WIREFRAME_WGSL_BODY;
}

// Wireframe material uniform: color vec4f = 16 bytes / 4 floats.
const WIREFRAME_UNIFORM_BYTES = 16;

const WIREFRAME_WGSL_BODY = /* wgsl */ `
struct WireframeMaterial {
  color : vec4f,  // linear rgba
};

@group(2) @binding(0) var<uniform> material : WireframeMaterial;

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  return vec4f(material.color.rgb, material.color.a * in.objectAlpha);
}
`;

const _scratch = new Float32Array(WIREFRAME_UNIFORM_BYTES / 4);
