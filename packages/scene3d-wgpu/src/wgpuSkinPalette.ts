import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type {
  Mesh,
  MeshGeometry,
  MeshGeometryRuntime,
  MeshSkinBindPose,
  WgpuRenderState,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { WgpuSkinningAdapter } from '@flighthq/types/contract';

import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';

export function destroyWgpuSkinPalette(state: WgpuRenderState): void {
  const runtime = getWgpuScene3DRuntime(state);
  runtime.skinPaletteTexture?.destroy();
  runtime.skinPaletteTexture = null;
  runtime.skinPaletteView = null;
  runtime.skinPaletteCapacity = 0;
  runtime.skinDrawBindGroup = null;
}

export function ensureWgpuSkinDrawBindGroup(
  state: WgpuRenderState,
  jointMatrices: Readonly<Float32Array>,
): GPUBindGroup {
  const scene = getWgpuScene3DRuntime(state);
  const stateRuntime = getWgpuRenderStateRuntime(state);
  const previousView = scene.skinPaletteView;
  const view = uploadWgpuSkinPalette(state, jointMatrices);
  if (scene.skinDrawBindGroup === null || previousView !== view) {
    scene.skinDrawBindGroup = state.device.createBindGroup({
      layout: ensureWgpuSkinDrawLayout(state),
      entries: [
        { binding: 0, resource: { buffer: stateRuntime.uniformBuffer, size: 176 } },
        { binding: 1, resource: view },
      ],
    });
  }
  return scene.skinDrawBindGroup;
}

export function ensureWgpuSkinDrawLayout(state: WgpuRenderState): GPUBindGroupLayout {
  const scene = getWgpuScene3DRuntime(state);
  if (scene.skinDrawBindGroupLayout === null) {
    scene.skinDrawBindGroupLayout = state.device.createBindGroupLayout({
      entries: [
        // binding 0 is the shared Draw uniform, and the FRAGMENT stage reads it too — the mesh fragment
        // tail takes its alpha-is-coverage flag from draw.params.y. This layout must stay stage-for-stage
        // identical to the non-skinned drawBindGroupLayout or a skinned pipeline fails validation.
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true },
        },
        // The joint palette is sampled in the vertex stage only.
        { binding: 1, visibility: GPUShaderStage.VERTEX, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
  }
  return scene.skinDrawBindGroupLayout;
}

export function registerWgpuGpuSkinning(state: WgpuRenderState): void {
  getWgpuScene3DRuntime(state).skinningAdapter = WGPU_SKINNING_ADAPTER;
}

// Uploads one flat column-major joint palette into the state-scoped single-row RGBA32F data texture.
// Four consecutive texels encode one mat4. Storage grows to the largest skeleton observed and is
// otherwise rewritten in place; there is deliberately no uniform-budget capacity gate or CPU fallback.
export function uploadWgpuSkinPalette(state: WgpuRenderState, jointMatrices: Readonly<Float32Array>): GPUTextureView {
  const runtime = getWgpuScene3DRuntime(state);
  const jointCount = (jointMatrices.length / 16) | 0;
  const width = jointCount * 4;
  if (runtime.skinPaletteTexture === null || jointCount > runtime.skinPaletteCapacity) {
    runtime.skinPaletteTexture?.destroy();
    runtime.skinPaletteTexture = state.device.createTexture({
      size: [width, 1, 1],
      format: 'rgba32float',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });
    runtime.skinPaletteView = runtime.skinPaletteTexture.createView();
    runtime.skinPaletteCapacity = jointCount;
    runtime.skinDrawBindGroup = null;
  }
  state.device.queue.writeTexture(
    { texture: runtime.skinPaletteTexture! },
    jointMatrices as Float32Array<ArrayBuffer>,
    { bytesPerRow: width * 16 },
    [width, 1, 1],
  );
  return runtime.skinPaletteView!;
}

function isGpuSkinned(mesh: Readonly<Mesh>): boolean {
  if (mesh.skin == null) return false;
  const attributes = mesh.geometry.layout.attributes;
  let hasJoints = false;
  let hasWeights = false;
  for (let i = 0; i < attributes.length; i++) {
    const semantic = attributes[i].semantic;
    if (semantic === 'joints0') hasJoints = true;
    if (semantic === 'weights0') hasWeights = true;
  }
  return hasJoints && hasWeights;
}

function extendMeshPrelude(rigidPrelude: string): string {
  return rigidPrelude
    .replace(
      '@group(1) @binding(0) var<uniform> draw : Draw;',
      `@group(1) @binding(0) var<uniform> draw : Draw;
@group(1) @binding(1) var jointTexture : texture_2d<f32>;

fn fetchJointMatrix(joint : u32) -> mat4x4f {
  let x = i32(joint * 4u);
  return mat4x4f(
    textureLoad(jointTexture, vec2i(x, 0), 0),
    textureLoad(jointTexture, vec2i(x + 1, 0), 0),
    textureLoad(jointTexture, vec2i(x + 2, 0), 0),
    textureLoad(jointTexture, vec2i(x + 3, 0), 0)
  );
}

fn skinMatrix(joints : vec4f, weights : vec4f) -> mat4x4f {
  return weights.x * fetchJointMatrix(u32(joints.x))
       + weights.y * fetchJointMatrix(u32(joints.y))
       + weights.z * fetchJointMatrix(u32(joints.z))
       + weights.w * fetchJointMatrix(u32(joints.w));
}`,
    )
    .replace(
      '  @location(3) uv : vec2f,\n) -> VertexOutput {',
      `  @location(3) uv : vec2f,
  @location(4) joints0 : vec4f,
  @location(5) weights0 : vec4f,
) -> VertexOutput {`,
    )
    .replace(
      '  var localTangent = tangent.xyz;\n  let world = draw.world * localPosition;',
      `  var localTangent = tangent.xyz;
  let skin = skinMatrix(joints0, weights0);
  localPosition = skin * localPosition;
  localNormal = (skin * vec4f(localNormal, 0.0)).xyz;
  localTangent = (skin * vec4f(localTangent, 0.0)).xyz;
  let world = draw.world * localPosition;`,
    );
}

function getUploadVertices(geometry: Readonly<MeshGeometry>): Float32Array | null {
  const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  const bindPose = runtime?.morphBindPose == null ? runtime?.skinBindPose : null;
  if (bindPose == null) return null;
  return buildSkinBindVertices(geometry, bindPose);
}

function hasBindPose(geometry: Readonly<MeshGeometry>): boolean {
  const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  return runtime?.morphBindPose == null && runtime?.skinBindPose != null;
}

function buildSkinBindVertices(geometry: Readonly<MeshGeometry>, bindPose: Readonly<MeshSkinBindPose>): Float32Array {
  const out = geometry.vertices.slice();
  const floatsPerVertex = geometry.layout.stride / 4;
  const positionOffset = floatOffsetForSemantic(geometry, 'position');
  const normalOffset = floatOffsetForSemantic(geometry, 'normal');
  const vertexCount = (bindPose.positions.length / 3) | 0;
  for (let v = 0; v < vertexCount; v++) {
    const base = v * floatsPerVertex;
    const source = v * 3;
    if (positionOffset >= 0) {
      out[base + positionOffset] = bindPose.positions[source]!;
      out[base + positionOffset + 1] = bindPose.positions[source + 1]!;
      out[base + positionOffset + 2] = bindPose.positions[source + 2]!;
    }
    if (normalOffset >= 0) {
      out[base + normalOffset] = bindPose.normals[source]!;
      out[base + normalOffset + 1] = bindPose.normals[source + 1]!;
      out[base + normalOffset + 2] = bindPose.normals[source + 2]!;
    }
  }
  return out;
}

function floatOffsetForSemantic(geometry: Readonly<MeshGeometry>, semantic: string): number {
  const attributes = geometry.layout.attributes;
  for (let i = 0; i < attributes.length; i++) {
    if (attributes[i].semantic === semantic) return attributes[i].byteOffset / 4;
  }
  return -1;
}

const WGPU_SKINNING_ADAPTER: WgpuSkinningAdapter = {
  extendMeshPrelude,
  getDrawBindGroup: ensureWgpuSkinDrawBindGroup,
  getDrawLayout: ensureWgpuSkinDrawLayout,
  getUploadVertices,
  hasBindPose,
  isGpuSkinned,
  vertexBufferLayouts: [
    {
      arrayStride: 80,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x4' },
        { shaderLocation: 3, offset: 40, format: 'float32x2' },
        { shaderLocation: 4, offset: 48, format: 'float32x4' },
        { shaderLocation: 5, offset: 64, format: 'float32x4' },
      ],
    },
  ],
};
