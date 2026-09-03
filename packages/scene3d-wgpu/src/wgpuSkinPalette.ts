import { getWgpuRenderStateRuntime, retireWgpuTexture } from '@flighthq/render-wgpu/contract';
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
  runtime.skinPaletteArenaCursor = 0;
  runtime.skinPaletteArenaRows = 0;
  runtime.skinPaletteArenaBases = null;
  runtime.skinArenaFrame = null;
  runtime.skinDrawBindGroup = null;
  // The mesh path's own texture and bind group, freed here too — a second layout means a second
  // resource, and leaking it would outlive the render state that owns it.
  runtime.skinNormalPaletteTexture?.destroy();
  runtime.skinNormalPaletteTexture = null;
  runtime.skinNormalPaletteView = null;
  runtime.skinNormalPaletteArenaCursor = 0;
  runtime.skinNormalPaletteArenaRows = 0;
  runtime.skinNormalPaletteArenaBases = null;
  runtime.skinMeshDrawBindGroup = null;
}

export function ensureWgpuSkinDrawBindGroup(
  state: WgpuRenderState,
  jointMatrices: Readonly<Float32Array>,
): GPUBindGroup {
  const scene = getWgpuScene3DRuntime(state);
  const stateRuntime = getWgpuRenderStateRuntime(state);
  uploadWgpuSkinPalette(state, jointMatrices);
  const view = scene.skinPaletteView!;
  if (scene.skinDrawBindGroup === null) {
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

// The MESH path's bind group: pose palette at binding 1, NORMAL palette at binding 2.
//
// ★ SEPARATE FROM THE SHADOW PATH'S BIND GROUP ON PURPOSE, AND NOT BECAUSE OF A VALIDATION WORRY. A
// bind group must satisfy every binding its layout declares, so a shared layout carrying binding 2
// would force the shadow path — which skins positions only and will never skin normals — to supply a
// normal-palette resource it has no use for, permanently. A layout states what a pipeline NEEDS; making
// the shadow pipeline declare a need it does not have would oblige every later maintainer to keep
// feeding it. The cost of this split is one extra layout and bind group, which is bounded and local.
export function ensureWgpuSkinMeshDrawBindGroup(
  state: WgpuRenderState,
  jointMatrices: Readonly<Float32Array>,
  normalMatrices: Readonly<Float32Array>,
): GPUBindGroup {
  const scene = getWgpuScene3DRuntime(state);
  const stateRuntime = getWgpuRenderStateRuntime(state);
  uploadWgpuSkinPalette(state, jointMatrices);
  uploadWgpuSkinNormalPalette(state, normalMatrices);
  const poseView = scene.skinPaletteView!;
  const normalView = scene.skinNormalPaletteView!;
  // Growing an arena nulls the bind group, so a null check is the whole invalidation rule — the views
  // only change when a texture is recreated, which is exactly when the upload above cleared this.
  if (scene.skinMeshDrawBindGroup === null) {
    scene.skinMeshDrawBindGroup = state.device.createBindGroup({
      layout: ensureWgpuSkinMeshDrawLayout(state),
      entries: [
        { binding: 0, resource: { buffer: stateRuntime.uniformBuffer, size: 176 } },
        { binding: 1, resource: poseView },
        { binding: 2, resource: normalView },
      ],
    });
  }
  return scene.skinMeshDrawBindGroup;
}

// The MESH path's layout: the shadow path's two bindings plus the normal palette at binding 2.
// Binding 0 keeps VERTEX|FRAGMENT visibility for the same reason it does below — the fragment tail
// reads draw.params.y — and the two palettes are vertex-stage only.
export function ensureWgpuSkinMeshDrawLayout(state: WgpuRenderState): GPUBindGroupLayout {
  const scene = getWgpuScene3DRuntime(state);
  if (scene.skinMeshDrawBindGroupLayout === null) {
    scene.skinMeshDrawBindGroupLayout = state.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true },
        },
        { binding: 1, visibility: GPUShaderStage.VERTEX, texture: { sampleType: 'unfilterable-float' } },
        // The normal palette — three texels per joint rather than four, since a 3x3 padded to vec4
        // columns is twelve floats.
        { binding: 2, visibility: GPUShaderStage.VERTEX, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
  }
  return scene.skinMeshDrawBindGroupLayout;
}

export function registerWgpuGpuSkinning(state: WgpuRenderState): void {
  getWgpuScene3DRuntime(state).skinningAdapter = WGPU_SKINNING_ADAPTER;
}

// Uploads the per-joint NORMAL palette into its own arena and returns the base TEXEL index its region
// starts at. THREE texels per joint, not four: each joint's 3x3 is stored as three vec4-padded columns,
// twelve floats.
//
// ★ THE JOINT COUNT IS DERIVED WITH /12, NOT /16. Reusing the pose palette's divisor here would
// under-count every skeleton by a quarter and upload a truncated region — a quiet corruption that
// renders as wrong lighting rather than as a failure.
export function uploadWgpuSkinNormalPalette(state: WgpuRenderState, normalMatrices: Readonly<Float32Array>): number {
  const runtime = getWgpuScene3DRuntime(state);
  beginWgpuSkinArenaFrame(state);
  const bases = runtime.skinNormalPaletteArenaBases!;
  const existing = bases.get(normalMatrices);
  if (existing !== undefined) return existing;

  const texels = ((normalMatrices.length / 12) | 0) * 3;
  const base = runtime.skinNormalPaletteArenaCursor;
  const rows = getWgpuSkinArenaRowCount(base + texels);
  if (rows > runtime.skinNormalPaletteArenaRows) {
    if (runtime.skinNormalPaletteTexture !== null) retireWgpuTexture(state, runtime.skinNormalPaletteTexture);
    runtime.skinNormalPaletteTexture = createWgpuSkinArenaTexture(state, rows);
    runtime.skinNormalPaletteView = runtime.skinNormalPaletteTexture.createView();
    runtime.skinNormalPaletteArenaRows = rows;
    runtime.skinMeshDrawBindGroup = null;
    // A grown arena is a NEW texture, so every region already handed out this frame lives in the old one.
    // Replaying them from the bases map is what keeps growth from silently blanking earlier draws.
    for (const [palette, replayBase] of bases) {
      writeWgpuSkinArenaRegion(state, runtime.skinNormalPaletteTexture, palette, replayBase);
    }
  }
  writeWgpuSkinArenaRegion(state, runtime.skinNormalPaletteTexture!, normalMatrices, base);
  runtime.skinNormalPaletteArenaCursor = base + rowAlignedWgpuSkinArenaTexels(texels);
  bases.set(normalMatrices, base);
  runtime.pendingSkinNormalPaletteBase = base;
  return base;
}

// Uploads one flat column-major joint palette into the per-frame arena and returns the base TEXEL index
// its region starts at. Four consecutive texels encode one mat4. There is deliberately no uniform-budget
// capacity gate and no CPU fallback.
export function uploadWgpuSkinPalette(state: WgpuRenderState, jointMatrices: Readonly<Float32Array>): number {
  const runtime = getWgpuScene3DRuntime(state);
  beginWgpuSkinArenaFrame(state);
  const bases = runtime.skinPaletteArenaBases!;
  const existing = bases.get(jointMatrices);
  if (existing !== undefined) {
    // Already resident this frame — the shadow pass and the mesh pass share one region for one skeleton.
    runtime.pendingSkinPaletteBase = existing;
    return existing;
  }

  const texels = ((jointMatrices.length / 16) | 0) * 4;
  const base = runtime.skinPaletteArenaCursor;
  const rows = getWgpuSkinArenaRowCount(base + texels);
  if (rows > runtime.skinPaletteArenaRows) {
    if (runtime.skinPaletteTexture !== null) retireWgpuTexture(state, runtime.skinPaletteTexture);
    runtime.skinPaletteTexture = createWgpuSkinArenaTexture(state, rows);
    runtime.skinPaletteView = runtime.skinPaletteTexture.createView();
    runtime.skinPaletteArenaRows = rows;
    runtime.skinDrawBindGroup = null;
    runtime.skinMeshDrawBindGroup = null;
    for (const [palette, replayBase] of bases) {
      writeWgpuSkinArenaRegion(state, runtime.skinPaletteTexture, palette, replayBase);
    }
  }
  writeWgpuSkinArenaRegion(state, runtime.skinPaletteTexture!, jointMatrices, base);
  runtime.skinPaletteArenaCursor = base + rowAlignedWgpuSkinArenaTexels(texels);
  bases.set(jointMatrices, base);
  runtime.pendingSkinPaletteBase = base;
  return base;
}

// Starts a new arena frame when render-wgpu has opened a new command encoder. The encoder is the frame
// identity rather than a counter: it is created once per frame and nulled at submit, so comparing it
// needs no new field in the shared render state and cannot drift out of step with the submit boundary.
function beginWgpuSkinArenaFrame(state: WgpuRenderState): void {
  const runtime = getWgpuScene3DRuntime(state);
  const encoder = getWgpuRenderStateRuntime(state).commandEncoder;
  if (runtime.skinArenaFrame === encoder && runtime.skinPaletteArenaBases !== null) return;
  runtime.skinArenaFrame = encoder;
  runtime.skinPaletteArenaCursor = 0;
  runtime.skinNormalPaletteArenaCursor = 0;
  runtime.skinPaletteArenaBases = new Map();
  runtime.skinNormalPaletteArenaBases = new Map();
}

function createWgpuSkinArenaTexture(state: WgpuRenderState, rows: number): GPUTexture {
  return state.device.createTexture({
    size: [WGPU_SKIN_ARENA_WIDTH, rows, 1],
    format: 'rgba32float',
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
  });
}

function getWgpuSkinArenaRowCount(texels: number): number {
  return Math.max(1, Math.ceil(texels / WGPU_SKIN_ARENA_WIDTH));
}

// Regions start on a row boundary so every write is a rectangle: a palette that straddles a row could not
// be expressed as one copy, and padding it to a full row would mean staging a copy of every palette.
function rowAlignedWgpuSkinArenaTexels(texels: number): number {
  return getWgpuSkinArenaRowCount(texels) * WGPU_SKIN_ARENA_WIDTH;
}

// Writes one palette into its arena region as at most two rectangles: the whole rows it fills, then the
// partial row left over. `base` is row-aligned, so both are rectangular and neither needs a staging copy.
function writeWgpuSkinArenaRegion(
  state: WgpuRenderState,
  texture: GPUTexture,
  palette: Readonly<Float32Array>,
  base: number,
): void {
  const texels = (palette.length / 4) | 0;
  const startRow = base / WGPU_SKIN_ARENA_WIDTH;
  const fullRows = (texels / WGPU_SKIN_ARENA_WIDTH) | 0;
  const remainder = texels - fullRows * WGPU_SKIN_ARENA_WIDTH;
  const queue = state.device.queue;
  const data = palette as Float32Array<ArrayBuffer>;
  if (fullRows > 0) {
    queue.writeTexture(
      { texture, origin: [0, startRow, 0] },
      data,
      { bytesPerRow: WGPU_SKIN_ARENA_WIDTH * 16, rowsPerImage: fullRows },
      [WGPU_SKIN_ARENA_WIDTH, fullRows, 1],
    );
  }
  if (remainder > 0) {
    queue.writeTexture(
      { texture, origin: [0, startRow + fullRows, 0] },
      data,
      { offset: fullRows * WGPU_SKIN_ARENA_WIDTH * 16, bytesPerRow: remainder * 16 },
      [remainder, 1, 1],
    );
  }
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
${getWgpuSkinBindingWgsl(1)}
${getWgpuSkinNormalBindingWgsl(1)}`,
    )
    .replace(
      '  @location(3) uv : vec2f,\n  @location(6) instanceModel0 : vec4f,',
      `  @location(3) uv : vec2f,
  @location(4) joints0 : vec4f,
  @location(5) weights0 : vec4f,
  @location(6) instanceModel0 : vec4f,`,
    )
    .replace(
      '  var localTangent = tangent.xyz;\n  let instanceModel =',
      `  var localTangent = tangent.xyz;
  let skin = skinMatrix(joints0, weights0);
  localPosition = skin * localPosition;
  localNormal = skinNormalMatrix(joints0, weights0) * localNormal;
  localTangent = (skin * vec4f(localTangent, 0.0)).xyz;
  let instanceModel =`,
    );
}

function extendShadowDepthPrelude(rigidPrelude: string): string {
  return rigidPrelude
    .replace(
      '@group(0) @binding(0) var<uniform> draw : Draw;',
      `@group(0) @binding(0) var<uniform> draw : Draw;
${getWgpuSkinBindingWgsl(0)}`,
    )
    .replace(
      '@vertex fn vs_main(@location(0) position : vec3f) -> @builtin(position) vec4f {',
      `@vertex fn vs_main(
  @location(0) position : vec3f,
  @location(4) joints0 : vec4f,
  @location(5) weights0 : vec4f,
) -> @builtin(position) vec4f {`,
    )
    .replace(
      '  var clip = draw.world * vec4f(position, 1.0);',
      '  var clip = draw.world * skinMatrix(joints0, weights0) * vec4f(position, 1.0);',
    );
}

// The MESH path's extra binding: the per-joint normal palette, three texels per joint.
//
// ★ A NORMAL IS A COVECTOR, so under non-uniform joint scale it follows the inverse-transpose rather
// than the matrix a position and a tangent follow. Blending the per-joint inverse-transposes is an
// APPROXIMATION — the inverse-transpose of the blend is a different matrix — and it is the affordable
// one, since the exact answer needs a 3x3 inverse per vertex. The CPU and GL paths blend identically,
// which is what makes comparing the three a real check rather than three different approximations.
function getWgpuSkinNormalBindingWgsl(group: number): string {
  return `@group(${group}) @binding(2) var jointNormalTexture : texture_2d<f32>;

fn loadJointNormalTexel(i : u32) -> vec3f {
  return textureLoad(jointNormalTexture, vec2i(i32(i % ${WGPU_SKIN_ARENA_WIDTH}u), i32(i / ${WGPU_SKIN_ARENA_WIDTH}u)), 0).xyz;
}

fn fetchJointNormalMatrix(joint : u32) -> mat3x3f {
  let x = u32(draw.params.w) + joint * 3u;
  return mat3x3f(
    loadJointNormalTexel(x),
    loadJointNormalTexel(x + 1u),
    loadJointNormalTexel(x + 2u)
  );
}

fn skinNormalMatrix(joints : vec4f, weights : vec4f) -> mat3x3f {
  return weights.x * fetchJointNormalMatrix(u32(joints.x))
       + weights.y * fetchJointNormalMatrix(u32(joints.y))
       + weights.z * fetchJointNormalMatrix(u32(joints.z))
       + weights.w * fetchJointNormalMatrix(u32(joints.w));
}`;
}

function getWgpuSkinBindingWgsl(group: number): string {
  // The arena width is interpolated from the one TypeScript constant that also sizes the texture, so the
  // shader's row arithmetic cannot drift from the allocator's.
  return `@group(${group}) @binding(1) var jointTexture : texture_2d<f32>;

fn loadJointTexel(i : u32) -> vec4f {
  return textureLoad(jointTexture, vec2i(i32(i % ${WGPU_SKIN_ARENA_WIDTH}u), i32(i / ${WGPU_SKIN_ARENA_WIDTH}u)), 0);
}

fn fetchJointMatrix(joint : u32) -> mat4x4f {
  let x = u32(draw.params.z) + joint * 4u;
  return mat4x4f(
    loadJointTexel(x),
    loadJointTexel(x + 1u),
    loadJointTexel(x + 2u),
    loadJointTexel(x + 3u)
  );
}

fn skinMatrix(joints : vec4f, weights : vec4f) -> mat4x4f {
  return weights.x * fetchJointMatrix(u32(joints.x))
       + weights.y * fetchJointMatrix(u32(joints.y))
       + weights.z * fetchJointMatrix(u32(joints.z))
       + weights.w * fetchJointMatrix(u32(joints.w));
}`;
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
  extendShadowDepthPrelude,
  getDrawBindGroup: ensureWgpuSkinDrawBindGroup,
  getDrawLayout: ensureWgpuSkinDrawLayout,
  getMeshDrawBindGroup: ensureWgpuSkinMeshDrawBindGroup,
  getMeshDrawLayout: ensureWgpuSkinMeshDrawLayout,
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

// Texels per arena row. 256 holds a 64-joint skeleton in exactly one row for the pose palette (four
// texels per joint), and the row wrap is reachable by any skeleton past that — which is what keeps the
// multi-row path exercised by ordinary content rather than only by content nobody has.
const WGPU_SKIN_ARENA_WIDTH = 256;
