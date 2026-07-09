import {
  createAabb,
  createFrustum,
  createMatrix4,
  isFrustumIntersectingAabb,
  multiplyMatrix4,
  setFrustumFromMatrix4,
  setOrthographicMatrix4,
  setPerspectiveMatrix4,
  transformAabbByMatrix4,
} from '@flighthq/geometry';
import type { LinearColor } from '@flighthq/materials';
import { unpackColorToLinear } from '@flighthq/materials';
import { getNodeRuntime, getNodeWorldTransformMatrix4 } from '@flighthq/node';
import type {
  Aabb,
  AmbientLight,
  Camera,
  DirectionalLight,
  Frustum,
  Matrix4,
  Mesh,
  NodeAny,
  RenderState,
  SceneLightBlock,
  SceneLights,
  SceneNode,
  SceneRenderList,
} from '@flighthq/types';

// Packs the directional + ambient draw-arg lights into `out` (the GPU-ready light block), converting
// each packed sRgb color to linear, premultiplied radiance (unpackColorToLinear(color) * intensity)
// so the shader never sees sRgb. Sets the presence counts (0 or 1 each). The float layout matches the
// shader's std140 light block: directional { direction.xyz, _pad, radiance.rgb, _pad } then ambient
// { radiance.rgb, _pad }. An absent term leaves its slots zeroed.
//
// `version` bumps only when the packed data or counts actually change from the previous pack — a
// no-op re-pack of identical lights leaves it untouched. This is the SceneLightBlock contract a
// backend keyed off `version` relies on to skip re-uploading an unchanged block across frames; a
// blind per-frame bump would defeat that skip. Packs into a scratch, compares, then commits only on
// change so an unchanged block is never dirtied.
export function packSceneLightBlock(out: SceneLightBlock, lights: Readonly<SceneLights>): void {
  scratchLightData.fill(0);

  let directionalCount = 0;
  const directional = lights.directional;
  if (directional !== null) {
    packDirectionalLight(scratchLightData, directional);
    directionalCount = 1;
  }

  let ambientCount = 0;
  const ambient = lights.ambient;
  if (ambient !== null) {
    packAmbientLight(scratchLightData, ambient);
    ambientCount = 1;
  }

  if (
    out.directionalCount === directionalCount &&
    out.ambientCount === ambientCount &&
    isFloat32ArrayEqual(out.data, scratchLightData)
  ) {
    return;
  }

  out.data.set(scratchLightData);
  out.directionalCount = directionalCount;
  out.ambientCount = ambientCount;
  out.version++;
}

// The per-frame preparation pass for a 3D scene, the 3D analog of prepareDisplayObjectRender. It is
// backend-agnostic (no GPU context): it walks the SceneNode hierarchy rooted at `scene`, propagating
// each node's worldMatrix (parentWorld x localMatrix, resolved lazily on the node runtime and
// alias-safe), computes the draw camera's view-projection, frustum-culls every Mesh against its
// world-space bounds, and packs `lights` into the shared SceneLightBlock (sRgb->linear at pack time).
// The returned SceneRenderList is the render-ready frame the backend drawScene consumes — it only
// has to upload buffers, bind, and draw the visible meshes.
//
// `aspect` for a perspective camera is taken from the render state's pixel-space target (width /
// height); a degenerate target falls back to 1. The returned list is reused scratch owned per render
// state (so a gl state and a wgpu state prepare independently); a caller must not retain it past the
// drawScene it feeds.
export function prepareSceneRender(
  state: RenderState,
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera>,
  lights: Readonly<SceneLights>,
): SceneRenderList {
  const prepared = ensurePreparedScene(state);
  const list = prepared.list;

  // RenderState carries no canonical viewport size, so a perspective camera supplies its own aspect
  // through its projection; this neutral fallback keeps an orthographic frame and a pre-aspected
  // perspective frame correct. A backend that owns a sized target sets the projection aspect first.
  setSceneViewProjectionMatrix4(prepared.viewProjection, camera, DEFAULT_VIEWPORT_ASPECT);
  setFrustumFromMatrix4(prepared.frustum, prepared.viewProjection);

  packSceneLightBlock(list.lights, lights);

  prepared.meshes.length = 0;
  collectVisibleMeshes(scene, prepared.frustum, prepared.worldBounds, prepared.meshes);
  list.meshCount = prepared.meshes.length;

  return list;
}

function collectVisibleMeshes(
  node: Readonly<NodeAny>,
  frustum: Readonly<Frustum>,
  worldBounds: Aabb,
  out: Mesh[],
): void {
  if (!node.enabled) {
    return;
  }

  // A node is a drawable Mesh (not a transform-only group) when it carries geometry. Structural,
  // so it holds for Meshes created with a custom kind, not just MeshKind.
  const mesh = node as unknown as Mesh;
  if (mesh.geometry != null && isMeshVisible(mesh, frustum, worldBounds)) {
    out.push(mesh);
  }

  const children = getNodeRuntime(node).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      collectVisibleMeshes(children[i], frustum, worldBounds, out);
    }
  }
}

function ensurePreparedScene(state: RenderState): PreparedScene {
  let prepared = preparedScenes.get(state);
  if (prepared === undefined) {
    const viewProjection = createMatrix4();
    const meshes: Mesh[] = [];
    const list: SceneRenderList = {
      lights: {
        ambientCount: 0,
        data: new Float32Array(LIGHT_BLOCK_FLOATS),
        directionalCount: 0,
        hemisphereCount: 0,
        pointCount: 0,
        spotCount: 0,
        version: 0,
      },
      meshCount: 0,
      viewProjection: viewProjection,
      visibleMeshes: meshes,
    };
    prepared = {
      frustum: createFrustum(),
      list: list,
      meshes: meshes,
      viewProjection: viewProjection,
      worldBounds: createAabb(),
    };
    preparedScenes.set(state, prepared);
  }
  return prepared;
}

function isFloat32ArrayEqual(a: Readonly<Float32Array>, b: Readonly<Float32Array>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function isMeshVisible(mesh: Readonly<Mesh>, frustum: Readonly<Frustum>, worldBounds: Aabb): boolean {
  const bounds = mesh.geometry.bounds;
  if (bounds === null) {
    // No cached local bounds: cannot cull, so conservatively keep the mesh.
    return true;
  }
  transformAabbByMatrix4(worldBounds, bounds, getNodeWorldTransformMatrix4(mesh));
  return isFrustumIntersectingAabb(frustum, worldBounds);
}

function packAmbientLight(data: Float32Array, ambient: Readonly<AmbientLight>): void {
  unpackColorToLinear(scratchColor, ambient.color);
  const intensity = ambient.intensity;
  data[8] = scratchColor[0] * intensity;
  data[9] = scratchColor[1] * intensity;
  data[10] = scratchColor[2] * intensity;
}

function packDirectionalLight(data: Float32Array, directional: Readonly<DirectionalLight>): void {
  data[0] = directional.direction.x;
  data[1] = directional.direction.y;
  data[2] = directional.direction.z;
  unpackColorToLinear(scratchColor, directional.color);
  const intensity = directional.intensity;
  data[4] = scratchColor[0] * intensity;
  data[5] = scratchColor[1] * intensity;
  data[6] = scratchColor[2] * intensity;
}

// Composes the camera's view-projection (projection x view) into `out`. For a perspective camera the
// projection's own aspect is used when set (non-zero), else the render state's `aspect` fallback;
// near/far come from the camera. Reads camera fields through a scratch projection before the multiply,
// so it is safe even if `out` aliases the camera's view.
function setSceneViewProjectionMatrix4(out: Matrix4, camera: Readonly<Camera>, aspect: number): void {
  const projection = camera.projection;
  if (projection.kind === 'perspective') {
    // Geometry's setPerspectiveMatrix4 takes the tangent of the half-FOV, not the full angle.
    setPerspectiveMatrix4(
      scratchProjection,
      Math.tan(projection.fovY * 0.5),
      projection.aspect !== 0 ? projection.aspect : aspect,
      camera.near,
      camera.far,
    );
  } else {
    setOrthographicMatrix4(
      scratchProjection,
      -projection.halfWidth,
      projection.halfWidth,
      -projection.halfHeight,
      projection.halfHeight,
      camera.near,
      camera.far,
    );
  }
  multiplyMatrix4(out, scratchProjection, camera.view);
}

// The per-render-state prepared frame: the reused SceneRenderList plus the scratch the prepare pass
// fills (the culling frustum, the live visible-mesh array, and a world-bounds scratch).
interface PreparedScene {
  frustum: Frustum;
  list: SceneRenderList;
  meshes: Mesh[];
  viewProjection: Matrix4;
  worldBounds: Aabb;
}

// Neutral viewport aspect used when a perspective camera does not carry its own.
const DEFAULT_VIEWPORT_ASPECT = 1;

// One directional ({ direction.xyz, _pad, radiance.rgb, _pad }) + one ambient ({ radiance.rgb,
// _pad }) = 12 floats, std140-aligned (vec4 boundaries).
const LIGHT_BLOCK_FLOATS = 12;

// Per-render-state prepared frames. Keyed by state so independent backends prepare without sharing
// scratch; a state's entry is freed when the state is GC'd.
const preparedScenes = new WeakMap<RenderState, PreparedScene>();

const scratchColor: LinearColor = [0, 0, 0, 0];
const scratchProjection = createMatrix4();

// Reused staging buffer for packSceneLightBlock's pack-then-compare: the new block is packed here and
// committed to `out.data` only when it differs, so an unchanged block never bumps `version`.
const scratchLightData = new Float32Array(LIGHT_BLOCK_FLOATS);
