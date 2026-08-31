import { unpackColorToLinear } from '@flighthq/color/contract';
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
} from '@flighthq/geometry/contract';
import { ensureMeshGeometryBounds } from '@flighthq/mesh/contract';
import {
  getNodeRuntime,
  getNodeWorldMatrix4,
  invalidateNodeLocalTransform,
  isNodeLocalMatrix4Detached,
} from '@flighthq/node/contract';
import type { LinearColor } from '@flighthq/types/contract';
import type {
  Aabb,
  AmbientLight,
  Camera3D,
  DirectionalLight,
  Frustum,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshRuntime,
  PointLight,
  RenderState,
  Scene3DLightBlock,
  Scene3DLightsLike,
  Node3D,
  Scene3DRenderList,
  SpotLight,
  Transform3DNode,
} from '@flighthq/types/contract';
import {
  MAX_FORWARD_LIGHTS,
  SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET,
  SCENE_LIGHT_BLOCK_FLOATS,
  SCENE_LIGHT_DIRECTIONAL_DIRECTION_OFFSET,
  SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET,
  SCENE_LIGHT_HEMISPHERE_OFFSET,
  SCENE_LIGHT_HEMISPHERE_STRIDE,
  SCENE_LIGHT_POINT_OFFSET,
  SCENE_LIGHT_POINT_STRIDE,
  SCENE_LIGHT_SPOT_OFFSET,
  SCENE_LIGHT_SPOT_STRIDE,
} from '@flighthq/types/contract';

// Packs the directional + ambient + punctual (point/spot/hemisphere) draw-arg lights into `out` (the
// GPU-ready light block), converting each packed sRgb color to linear, premultiplied radiance
// (unpackColorToLinear(color) * intensity) so the shader never sees sRgb. Sets every presence count
// (directional/ambient 0..1, point/spot/hemisphere 0..MAX_FORWARD_LIGHTS). The float layout matches
// the shader's std140 light block exactly (SCENE_LIGHT_* offsets/strides in @flighthq/types); absent
// terms and unused array slots stay zeroed. Punctual arrays beyond MAX_FORWARD_LIGHTS are dropped.
//
// `version` bumps only when the packed data or counts actually change from the previous pack — a
// no-op re-pack of identical lights leaves it untouched. This is the Scene3DLightBlock contract a
// backend keyed off `version` relies on to skip re-uploading an unchanged block across frames; a
// blind per-frame bump would defeat that skip. Packs into a scratch, compares, then commits only on
// change so an unchanged block is never dirtied.
export function packScene3DLightBlock(out: Scene3DLightBlock, lights: Readonly<Scene3DLightsLike>): void {
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

  let pointCount = 0;
  const point = lights.point;
  if (point !== undefined) {
    pointCount = Math.min(point.length, MAX_FORWARD_LIGHTS);
    for (let i = 0; i < pointCount; i++) {
      packPointLight(scratchLightData, SCENE_LIGHT_POINT_OFFSET + i * SCENE_LIGHT_POINT_STRIDE, point[i]);
    }
  }

  let spotCount = 0;
  const spot = lights.spot;
  if (spot !== undefined) {
    spotCount = Math.min(spot.length, MAX_FORWARD_LIGHTS);
    for (let i = 0; i < spotCount; i++) {
      packSpotLight(scratchLightData, SCENE_LIGHT_SPOT_OFFSET + i * SCENE_LIGHT_SPOT_STRIDE, spot[i]);
    }
  }

  let hemisphereCount = 0;
  const hemisphere = lights.hemisphere;
  if (hemisphere !== undefined) {
    hemisphereCount = Math.min(hemisphere.length, MAX_FORWARD_LIGHTS);
    for (let i = 0; i < hemisphereCount; i++) {
      packHemisphereLight(
        scratchLightData,
        SCENE_LIGHT_HEMISPHERE_OFFSET + i * SCENE_LIGHT_HEMISPHERE_STRIDE,
        hemisphere[i],
      );
    }
  }

  if (
    out.directionalCount === directionalCount &&
    out.ambientCount === ambientCount &&
    out.pointCount === pointCount &&
    out.spotCount === spotCount &&
    out.hemisphereCount === hemisphereCount &&
    isFloat32ArrayEqual(out.data, scratchLightData)
  ) {
    return;
  }

  out.data.set(scratchLightData);
  out.directionalCount = directionalCount;
  out.ambientCount = ambientCount;
  out.pointCount = pointCount;
  out.spotCount = spotCount;
  out.hemisphereCount = hemisphereCount;
  out.version++;
}

// The per-frame preparation pass for a 3D scene, the 3D analog of prepareScene2DRender. It is
// backend-agnostic (no GPU context): it walks the Node3D hierarchy rooted at `scene`, propagating
// each node's world matrix (parentWorld x local matrix, resolved lazily on the node runtime and
// alias-safe), computes the draw camera's view-projection, frustum-culls every Mesh against its
// world-space bounds, and packs `lights` into the shared Scene3DLightBlock (sRgb->linear at pack time).
// The returned Scene3DRenderList is the render-ready frame the backend drawScene3D consumes — it only
// has to upload buffers, bind, and draw the visible meshes.
//
// DEFORMATION IS A SEPARATE, EARLIER PASS. This pass no longer readies skinning palettes or blends
// morphs — that would force @flighthq/render to depend on @flighthq/skeleton3d and bundle skinning into
// every rigid or 2D consumer. A skinned scene must call prepareScene3DSkinning (@flighthq/skeleton3d) and
// a morphed scene prepareScene3DMorph (@flighthq/scene3d) BEFORE this pass; each readies its own deformer
// and writes the mesh's posed local bounds (skin: the deformedLocalBounds node-runtime slot this pass
// reads; morph: the geometry vertices, hence its ensured bounds). Cull here consumes those as data, so
// it sees the current-frame posed silhouette without any skinning code in this package. A rigid scene
// calls neither and this pass is unchanged.
//
// `viewportAspect`, when supplied by a backend draw path, is authoritative for a perspective camera.
// Omitting it uses the projection's authored aspect for standalone/headless preparation. The returned
// list is reused scratch owned per render state (so a gl state and a wgpu state prepare independently);
// a caller must not retain it past the drawScene3D it feeds.
export function prepareScene3DRender(
  state: RenderState,
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
  viewportAspect?: number,
): Scene3DRenderList {
  const prepared = ensurePreparedScene3D(state);
  const list = prepared.list;

  // RenderState carries no canonical viewport size. Backend draws pass their active viewport ratio;
  // neutral callers fall back to the authored projection without mutating it.
  setScene3DViewProjectionMatrix4(
    prepared.viewProjection,
    camera,
    resolveScene3DViewportAspect(camera, viewportAspect),
  );
  setFrustumFromMatrix4(prepared.frustum, prepared.viewProjection);

  packScene3DLightBlock(list.lights, lights);

  prepared.meshes.length = 0;
  // The sync policy governs transform freshness in the prepare pass, consistently with the 2D
  // display-object prepare: 'refreshDerivedState' (the default) recomposes every visited node's
  // matrices from its current transform each frame, so a bare `mesh.position.x = …` shows up with no
  // caller-side invalidate; 'requiresInvalidation' trusts the caller's invalidate* calls instead.
  const refreshTransforms = state.sceneGraphSyncPolicy === 'refreshDerivedState';
  collectVisibleMeshes(scene, prepared.frustum, prepared.worldBounds, prepared.meshes, refreshTransforms);
  list.meshCount = prepared.meshes.length;

  return list;
}

function collectVisibleMeshes(
  root: Readonly<Node3D>,
  frustum: Readonly<Frustum>,
  worldBounds: Aabb,
  out: Mesh[],
  refreshTransforms: boolean,
): void {
  const stack = _collectStack;
  stack[0] = root;
  let stackLength = 1;

  while (stackLength > 0) {
    const node = stack[--stackLength];

    if (!node.enabled || !node.visible) {
      continue;
    }

    // Under 'refreshDerivedState', bump the local-transform revision of every visited node before its
    // world matrix is read below. Pre-order walk order means an ancestor is invalidated before any
    // descendant resolves the parent chain, so the whole visible subtree recomposes from live transform
    // fields this frame. A directly-authored local matrix is already the node's authoritative transform;
    // invalidating a detached matrix here would recompose from dormant TRS fields and erase
    // setNodeLocalMatrix4().
    if (refreshTransforms && !isNodeLocalMatrix4Detached(node as Transform3DNode)) {
      invalidateNodeLocalTransform(node);
    }

    if (isSceneMesh(node) && isMeshVisible(node, frustum, worldBounds)) {
      out.push(node);
    }

    const children = getNodeRuntime(node).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        stack[stackLength++] = children[i];
      }
    }
  }
}

function ensurePreparedScene3D(state: RenderState): PreparedScene3D {
  let prepared = preparedScene3Ds.get(state);
  if (prepared === undefined) {
    const viewProjection = createMatrix4();
    const meshes: Mesh[] = [];
    const list: Scene3DRenderList = {
      lights: {
        ambientCount: 0,
        data: new Float32Array(SCENE_LIGHT_BLOCK_FLOATS),
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
    preparedScene3Ds.set(state, prepared);
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
  // Prefer the posed local bounds a deform pass wrote to the node runtime (skinned meshes deform in
  // the shader, so geometry.vertices/bounds stay bind pose and would cull a swung limb wrongly). It is
  // plain data — no skinning code reached from here. Fall back to the geometry's own ensured bounds
  // for rigid and morphed meshes (morph writes real vertices, so those bounds are already posed).
  const runtime = getNodeRuntime(mesh) as MeshRuntime;
  // A skinned mesh with no posed bounds means the deform pass this one documents as a precondition did
  // not run. Culling then silently uses BIND POSE bounds and a swung limb disappears — a rendering
  // failure with nothing pointing at the missing pass. The comment above stated that requirement to the
  // caller; this is the seam that can actually tell them.
  if (mesh.skin !== null && mesh.skin !== undefined && runtime.deformedLocalBounds == null) {
    _skinnedBoundsGuard?.(mesh);
  }
  const bounds = runtime.deformedLocalBounds ?? ensureMeshGeometryBounds(mesh.geometry);
  if (bounds === null) {
    // No bounds at all (empty geometry): cannot cull, so conservatively keep the mesh.
    return true;
  }
  transformAabbByMatrix4(worldBounds, bounds, getNodeWorldMatrix4(mesh));
  return isFrustumIntersectingAabb(frustum, worldBounds);
}

function packAmbientLight(data: Float32Array, ambient: Readonly<AmbientLight>): void {
  unpackColorToLinear(scratchColor, ambient.color);
  const intensity = ambient.intensity;
  data[SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET + 0] = scratchColor[0] * intensity;
  data[SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET + 1] = scratchColor[1] * intensity;
  data[SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET + 2] = scratchColor[2] * intensity;
}

function packDirectionalLight(data: Float32Array, directional: Readonly<DirectionalLight>): void {
  data[SCENE_LIGHT_DIRECTIONAL_DIRECTION_OFFSET + 0] = directional.direction.x;
  data[SCENE_LIGHT_DIRECTIONAL_DIRECTION_OFFSET + 1] = directional.direction.y;
  data[SCENE_LIGHT_DIRECTIONAL_DIRECTION_OFFSET + 2] = directional.direction.z;
  unpackColorToLinear(scratchColor, directional.color);
  const intensity = directional.intensity;
  data[SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET + 0] = scratchColor[0] * intensity;
  data[SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET + 1] = scratchColor[1] * intensity;
  data[SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET + 2] = scratchColor[2] * intensity;
}

// Gradient ambient: sky radiance @+0, ground radiance @+4, world-up @+8. Both colors are premultiplied
// by the shared intensity. `up` is packed as world +Y so the shader blends sky/ground by dot(N, up)
// without the HemisphereLight type needing to carry an orientation.
function packHemisphereLight(data: Float32Array, offset: number, hemisphere: Readonly<HemisphereLight>): void {
  const intensity = hemisphere.intensity;
  unpackColorToLinear(scratchColor, hemisphere.skyColor);
  data[offset + 0] = scratchColor[0] * intensity;
  data[offset + 1] = scratchColor[1] * intensity;
  data[offset + 2] = scratchColor[2] * intensity;
  unpackColorToLinear(scratchColor, hemisphere.groundColor);
  data[offset + 4] = scratchColor[0] * intensity;
  data[offset + 5] = scratchColor[1] * intensity;
  data[offset + 6] = scratchColor[2] * intensity;
  data[offset + 8] = 0;
  data[offset + 9] = 1;
  data[offset + 10] = 0;
}

// Point light: position.xyz + range @+0, radiance.rgb + invSqrRange @+4. `invSqrRange` is 1/range^2
// (0 for infinite range, range <= 0), the smooth inverse-square windowing factor the shader applies.
function packPointLight(data: Float32Array, offset: number, point: Readonly<PointLight>): void {
  const range = point.range;
  data[offset + 0] = point.position.x;
  data[offset + 1] = point.position.y;
  data[offset + 2] = point.position.z;
  data[offset + 3] = range;
  unpackColorToLinear(scratchColor, point.color);
  const intensity = point.intensity;
  data[offset + 4] = scratchColor[0] * intensity;
  data[offset + 5] = scratchColor[1] * intensity;
  data[offset + 6] = scratchColor[2] * intensity;
  data[offset + 7] = range > 0 ? 1 / (range * range) : 0;
}

// Spot light: point's position+range @+0 and radiance+invSqrRange @+4, then direction.xyz @+8 and the
// precomputed cone cosines (inner @+12, outer @+13) the shader smoothsteps between for cone falloff.
function packSpotLight(data: Float32Array, offset: number, spot: Readonly<SpotLight>): void {
  const range = spot.range;
  data[offset + 0] = spot.position.x;
  data[offset + 1] = spot.position.y;
  data[offset + 2] = spot.position.z;
  data[offset + 3] = range;
  unpackColorToLinear(scratchColor, spot.color);
  const intensity = spot.intensity;
  data[offset + 4] = scratchColor[0] * intensity;
  data[offset + 5] = scratchColor[1] * intensity;
  data[offset + 6] = scratchColor[2] * intensity;
  data[offset + 7] = range > 0 ? 1 / (range * range) : 0;
  data[offset + 8] = spot.direction.x;
  data[offset + 9] = spot.direction.y;
  data[offset + 10] = spot.direction.z;
  data[offset + 12] = spot.innerConeCos;
  data[offset + 13] = spot.outerConeCos;
}

// Composes the camera's view-projection (projection x view) into `out`. For a perspective camera the
// resolved draw-time `aspect` is authoritative; near/far come from the camera. Reads camera fields
// through a scratch projection before the multiply, so it is safe even if `out` aliases camera.view.
function setScene3DViewProjectionMatrix4(out: Matrix4, camera: Readonly<Camera3D>, aspect: number): void {
  const projection = camera.projection;
  if (projection.kind === 'perspective') {
    setPerspectiveMatrix4(scratchProjection, Math.tan(projection.fovY * 0.5), aspect, camera.near, camera.far);
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
  applyScene3DProjectionJitter(scratchProjection, camera.jitter.x, camera.jitter.y);
  multiplyMatrix4(out, scratchProjection, camera.view);
}

function applyScene3DProjectionJitter(out: Matrix4, x: number, y: number): void {
  const m = out.m;
  m[0] += x * m[3];
  m[4] += x * m[7];
  m[8] += x * m[11];
  m[12] += x * m[15];
  m[1] += y * m[3];
  m[5] += y * m[7];
  m[9] += y * m[11];
  m[13] += y * m[15];
}

function resolveScene3DViewportAspect(camera: Readonly<Camera3D>, viewportAspect: number | undefined): number {
  if (viewportAspect !== undefined && Number.isFinite(viewportAspect) && viewportAspect > 0) {
    return viewportAspect;
  }
  const projection = camera.projection;
  if (projection.kind === 'perspective' && Number.isFinite(projection.aspect) && projection.aspect > 0) {
    return projection.aspect;
  }
  return DEFAULT_VIEWPORT_ASPECT;
}

// The per-render-state prepared frame: the reused Scene3DRenderList plus the scratch the prepare pass
// fills (the culling frustum, the live visible-mesh array, and a world-bounds scratch).
interface PreparedScene3D {
  frustum: Frustum;
  list: Scene3DRenderList;
  meshes: Mesh[];
  viewProjection: Matrix4;
  worldBounds: Aabb;
}

// Neutral viewport aspect used when a perspective camera does not carry its own.
const DEFAULT_VIEWPORT_ASPECT = 1;

// Per-render-state prepared frames. Keyed by state so independent backends prepare without sharing
// scratch; a state's entry is freed when the state is GC'd.
const preparedScene3Ds = new WeakMap<RenderState, PreparedScene3D>();

const scratchColor: LinearColor = [0, 0, 0, 0];
const scratchProjection = createMatrix4();

// Reused staging buffer for packScene3DLightBlock's pack-then-compare: the new block is packed here and
// committed to `out.data` only when it differs, so an unchanged block never bumps `version`. Sized to
// the full head + MAX_FORWARD_LIGHTS-per-type layout (SCENE_LIGHT_BLOCK_FLOATS).
const scratchLightData = new Float32Array(SCENE_LIGHT_BLOCK_FLOATS);

/** Installs the skinned-bounds guard, or clears it with `null`. The seam exists so the message and the
 *  `@flighthq/log` dependency live in the separately-importable guard module rather than on the cull
 *  path; not importing that module costs production nothing. Called by `enableSceneRenderGuards`. */
export function setSkinnedMeshBoundsGuard(guard: ((mesh: Readonly<Mesh>) => void) | null): void {
  _skinnedBoundsGuard = guard;
}

function isSceneMesh(node: Readonly<Node3D>): node is Mesh {
  return 'geometry' in node && node.geometry != null;
}

const _collectStack: Readonly<Node3D>[] = [];
let _skinnedBoundsGuard: ((mesh: Readonly<Mesh>) => void) | null = null;
