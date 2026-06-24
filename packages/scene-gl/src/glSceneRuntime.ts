import type { GlMeshMaterialRenderer, GlRenderState, GlRenderStateRuntime, Kind, MeshGeometry } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import type { GlMeshProgram } from './glMeshProgram';

// A per-subset draw record held in the two-pass draw lists. Pooled on GlSceneRuntime to avoid
// per-frame allocation. Fields are set at partition time and consumed during the opaque/blended
// passes; the pool is never exposed outside drawGlScene.
export interface GlSceneDrawEntry {
  clipW: number;
  material: object;
  mesh: object;
  normalMatrix: object;
  renderer: object;
  subset: object;
  worldMatrix: object;
}

// scene-gl's per-GlRenderState private state: the 3D mesh-material registry, the shared mesh-material
// program cache (keyed by family + define key), and the per-state geometry GPU-upload cache. These
// are scene-gl-owned, distinct from the 2D renderer's materialRendererMap/textureCache — a material
// kind is either 2D or 3D, never both. The registry and upload cache are surfaced through the
// header's GlRenderStateRuntime.sceneMeshMaterialRegistry / sceneMeshUploadCache slots (kept opaque
// there), and the program cache lives only here (scene-gl never needs to name it in the header).
// `activeMeshProgram` is the bind()→draw() handoff: bind selects a family's program and stores it
// here; draw reads it back. The draw-entry pools (`blendedPool`/`opaquePool`) and the per-frame
// draw lists (`blendedDrawList`/`opaqueDrawList`) live here so two independent render states never
// share allocation. One GlSceneRuntime is created lazily per state by getGlSceneRuntime.
export interface GlSceneRuntime {
  activeMeshProgram: GlMeshProgram | null;
  blendedDrawList: GlSceneDrawEntry[];
  blendedPool: GlSceneDrawEntry[];
  materialRegistry: Map<Kind, GlMeshMaterialRenderer>;
  opaqueDrawList: GlSceneDrawEntry[];
  opaquePool: GlSceneDrawEntry[];
  programCache: Map<string, GlMeshProgram>;
  uploadCache: WeakMap<MeshGeometry, GlMeshUpload>;
}

// The GPU upload of one MeshGeometry for one GlRenderState: a VAO binding the interleaved vertex
// buffer and index buffer, the element type/count for indexed draws, and the geometry `version`
// the buffers were uploaded at (so a bumped version forces a re-upload). Cached in the upload cache
// keyed by the geometry entity, the per-state parallel of MeshGeometryRuntime.webglData.
export interface GlMeshUpload {
  indexBuffer: WebGLBuffer | null;
  indexCount: number;
  indexType: number;
  vao: WebGLVertexArrayObject;
  version: number;
  vertexBuffer: WebGLBuffer;
}

// Resolves scene-gl's private runtime for a GlRenderState, allocating it (and wiring the header
// runtime slots to its registry and upload cache) on first use. Mutable by design: the draw path
// writes the caches every frame.
export function getGlSceneRuntime(state: GlRenderState): GlSceneRuntime {
  const stateRuntime = state[EntityRuntimeKey] as GlRenderStateRuntime;
  let scene = sceneRuntimes.get(state);
  if (scene === undefined) {
    scene = {
      activeMeshProgram: null,
      blendedDrawList: [],
      blendedPool: [],
      materialRegistry: new Map(),
      opaqueDrawList: [],
      opaquePool: [],
      programCache: new Map(),
      uploadCache: new WeakMap(),
    };
    sceneRuntimes.set(state, scene);
    // Surface the registry + upload cache through the header's opaque runtime slots so other code
    // (and a future destroy path) can find them by name without importing scene-gl internals.
    stateRuntime.sceneMeshMaterialRegistry = scene.materialRegistry;
    stateRuntime.sceneMeshUploadCache = scene.uploadCache as unknown as WeakMap<object, object>;
  }
  return scene;
}

const sceneRuntimes = new WeakMap<GlRenderState, GlSceneRuntime>();
