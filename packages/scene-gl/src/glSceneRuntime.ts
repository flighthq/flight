import type { GlMeshMaterialRenderer, GlRenderState, GlRenderStateRuntime, Kind, MeshGeometry } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import type { GlPbrProgram } from './glPbrProgramCache';

// scene-gl's per-GlRenderState private state: the 3D mesh-material registry, the StandardPbr
// program cache (keyed by define key), and the per-state geometry GPU-upload cache. These are
// scene-gl-owned, distinct from the 2D renderer's materialRendererMap/textureCache — a material
// kind is either 2D or 3D, never both. The registry and upload cache are surfaced through the
// header's GlRenderStateRuntime.sceneMeshMaterialRegistry / sceneMeshUploadCache slots (kept
// opaque there), and the program cache lives only here (scene-gl never needs to name it in the
// header). One GlSceneRuntime is created lazily per state by getGlSceneRuntime.
export interface GlSceneRuntime {
  activePbrProgram: GlPbrProgram | null;
  materialRegistry: Map<Kind, GlMeshMaterialRenderer>;
  pbrProgramCache: Map<string, GlPbrProgram>;
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
      activePbrProgram: null,
      materialRegistry: new Map(),
      pbrProgramCache: new Map(),
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
