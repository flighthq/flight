import { drawGlScene } from '@flighthq/scene-gl';
import type { Camera3D, GlRenderEffectPipeline, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  addNodeChild,
  beginGlRenderEffectPipeline,
  copyQuaternion,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createMeshGeometry,
  createPerspectiveProjection,
  createQuaternion,
  createScene,
  createSceneNode,
  createSkeleton3D,
  createUnlitMaterial,
  createVector3,
  endGlRenderEffectPipeline,
  getSurfacePixelLuminance,
  invalidateNodeLocalTransform,
  normalizeVector3,
  prepareSceneRender,
  registerUnlitGlMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
  setQuaternionFromAxisAngle,
  setVector3,
} from '@flighthq/sdk';

// scene-skinning — exercises the GL GPU-skinning draw path end to end: a Mesh in the canonical skinned
// layout (joints0/weights0 channels) bound to a two-joint Skeleton3D, deformed on the GPU through the
// bone-palette DATA TEXTURE read via texelFetch (the HAS_SKIN vertex variant), NOT a uniform mat4[] array.
// The lower half of a vertical bar is weighted to a stationary root joint; the upper half to a mid-height
// bend joint that is rotated 75° about +Z, so the posed bar leans hard to one side. The oracle asserts
// the POSED silhouette differs from the BIND-POSE silhouette (the same scene drawn with the bend joint at
// identity): a probe column that is background at bind pose becomes covered when posed, and the straight-up
// bind silhouette clears at the top where the leaned bar no longer reaches. A skin that failed to upload
// the palette or bind the texelFetch texture would draw the rigid bind pose and both probes would match.
//
// drawGlScene collides in the @flighthq/sdk barrel (re-exported from both scene-gl and scene-wgpu) — import
// the Gl one directly. Pipeline wiring (rgba16f + depth scene target, depth clear to far) mirrors the mesh-*
// scenes; prepareSceneRender computes each skinned mesh's jointMatrices palette before the draw.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerUnlitGlMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<SceneNode>, camera: Readonly<Camera3D>, lights: Readonly<SceneLights>): void {
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareSceneRender(state, scene, camera, lights);
  drawGlScene(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A vertical bar from y=0 to y=2, four rings of a small square cross-section (x,z ∈ ±halfWidth) at
// y = 0, 1, 2. The bottom two rings (y ≤ 1) are weighted fully to joint 0 (root); the top ring (y = 2)
// fully to joint 1 (bend). The middle ring (y = 1) sits at the joint so weighting it to the bend keeps the
// deform continuous. Built directly in CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT (20 floats/vertex).
const halfWidth = 0.22;
const ringY = [0, 1, 2];
const ringJoint = [0, 0, 1]; // rings at y=0,1 → root; y=2 → bend
const cornerX = [-halfWidth, halfWidth, halfWidth, -halfWidth];
const cornerZ = [-halfWidth, -halfWidth, halfWidth, halfWidth];

const STRIDE = 20;
const vertexCount = ringY.length * 4;
const vertices = new Float32Array(vertexCount * STRIDE);
for (let r = 0; r < ringY.length; r++) {
  for (let c = 0; c < 4; c++) {
    const base = (r * 4 + c) * STRIDE;
    vertices[base + 0] = cornerX[c];
    vertices[base + 1] = ringY[r];
    vertices[base + 2] = cornerZ[c];
    // normal (outward-ish from the bar axis) — unlit ignores it but the layout carries it.
    vertices[base + 3] = cornerX[c];
    vertices[base + 4] = 0;
    vertices[base + 5] = cornerZ[c];
    // tangent (unused by unlit)
    vertices[base + 8] = 1;
    // uv0 (unused)
    // joints0 — a single full-weight influence on this ring's joint.
    vertices[base + 12] = ringJoint[r];
    // weights0
    vertices[base + 16] = 1;
  }
}

// Side quads between consecutive rings (two triangles per face), wound CCW for outward faces. Cull is
// back-face by default; a double-sided-free bar is fine since the camera sees the front faces.
const indices: number[] = [];
for (let r = 0; r < ringY.length - 1; r++) {
  for (let c = 0; c < 4; c++) {
    const a = r * 4 + c;
    const b = r * 4 + ((c + 1) % 4);
    const a2 = (r + 1) * 4 + c;
    const b2 = (r + 1) * 4 + ((c + 1) % 4);
    indices.push(a, b, b2, a, b2, a2);
  }
}

const material = createUnlitMaterial({ baseColor: 0xff8030ff });

// Two joints: a stationary root at the origin, and a bend joint parented mid-height that carries the
// pose rotation. computeSkeleton3DJointMatrices (run inside prepareSceneRender) fills the palette from
// each joint's world transform × inverse-bind.
function buildPosedScene(bendAngle: number): SceneNode {
  const root = createSceneNode();
  const bend = createSceneNode();
  setVector3(bend.position, 0, 1, 0);
  invalidateNodeLocalTransform(bend);
  addNodeChild(root, bend);

  // Capture the inverse-bind matrices from the REST pose (bend unrotated) so the palette is identity at
  // rest; only then apply the pose rotation, so jointWorld × inverseBind is a real non-identity deform.
  // Building the skeleton after rotating the bend would bake the rotation into the bind and cancel it.
  const skeleton = createSkeleton3D([root, bend]);

  const q = createQuaternion();
  setQuaternionFromAxisAngle(q, createVector3(0, 0, 1), bendAngle);
  copyQuaternion(bend.rotation, q);
  invalidateNodeLocalTransform(bend);

  const scene = createScene().root;
  addNodeChild(scene, root);
  const geometry = createMeshGeometry({
    layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
  });
  const mesh = createMesh(geometry, [material]);
  mesh.skin = { skeleton };
  addNodeChild(scene, mesh);
  return scene;
}

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
// Look straight down the +Z axis at the bar's mid-height so the bend reads as a lateral lean in screen X.
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 1, 5), createVector3(0, 1, 0), createVector3(0, 1, 0));

const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = {
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
};

// The posed rig: the upper half leans 75° to +X.
const posedScene = buildPosedScene((75 * Math.PI) / 180);
render(posedScene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const w = surface.width;
  const h = surface.height;
  const covered = (fx: number, fy: number): boolean =>
    getSurfacePixelLuminance(surface, Math.floor(w * fx), Math.floor(h * fy)) > 90;

  // The upper half swings toward -X (the 75° bend about +Z), so the leaned arm covers a region LEFT of
  // center and above mid-height. A bind-pose (vertical) bar would leave this region background — so this
  // probe is the discriminating posed≠bind check: covered here only because the bone palette deformed it.
  if (!covered(0.38, 0.43)) {
    throw new Error(
      '[scene-skinning] leaned-arm probe (0.38,0.43) is background — the bar did not deform (bone palette not uploaded/sampled)',
    );
  }

  // Top-center, where a straight bind-pose bar's top would reach: the leaned bar has VACATED it.
  if (covered(0.5, 0.2)) {
    throw new Error(
      '[scene-skinning] top-center (0.5,0.2) still covered — bar drew straight-up (bind pose), not the posed lean',
    );
  }

  // Sanity: the root-weighted lower half is present and stationary at the vertical base column.
  if (!covered(0.53, 0.65)) {
    throw new Error('[scene-skinning] base (0.53,0.65) is background — the bar is missing entirely');
  }
}
