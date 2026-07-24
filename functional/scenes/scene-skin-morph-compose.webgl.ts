import { drawGlScene } from '@flighthq/scene-gl';
import type { Camera3D, GlRenderEffectPipeline, Mesh, MeshMorph, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
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
  prepareSceneMorph,
  prepareSceneRender,
  prepareSceneSkinning,
  registerUnlitGlMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
  setQuaternionFromAxisAngle,
  setVector3,
} from '@flighthq/sdk';

// scene-skin-morph-compose — the end-to-end compose proof for Part-1 #3: a single Mesh that is BOTH
// GPU-skinned and morphed rendering both deforms together on the GPU, driven through the real app path
// (prepareSceneMorph → prepareSceneSkinning → prepareSceneRender → drawGlScene). The glMeshUpload freeze
// this un-froze (skinBindUploaded ignoring version) would otherwise discard a morph composed onto a
// skinned draw; the precise across-frames regression for that freeze lives in the ensureGlMeshUpload unit
// test, while this scene proves the composed frame renders correctly end to end.
//
// The same two-joint leaning bar as scene-skinning (upper half weighted to a bend joint rotated 75° about
// +Z, lower half to a stationary root), PLUS a morph target that EXTENDS the bar DOWNWARD (the bottom
// ring pushed to y=-1.5). The two deforms are deliberately ORTHOGONAL screen axes: skin LEANS the top
// sideways (horizontal), morph EXTENDS the base down (vertical), so each has a probe the other cannot
// reach. The oracle discriminates all three failure modes:
//   - morph discarded (the freeze bug): the base stops at y=0 — the deep vertical-extension probe is background.
//   - skin discarded: a straight-up bar — the sideways leaned-arm probe is background.
//   - either deform missing entirely: the bar is blank or bind-pose.
// drawGlScene collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu) — import the Gl one directly.
// prepareSceneMorph then prepareSceneSkinning both run before prepareSceneRender.
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
  // Both deform passes run before the render prepare pass. prepareSceneMorph blends the morph into
  // geometry.vertices (fattening the bar); prepareSceneSkinning readies the joint palette. The GPU then
  // skins the freshly-morphed bind each frame — the compose the glMeshUpload fix restored.
  prepareSceneMorph(scene);
  prepareSceneSkinning(scene);
  prepareSceneRender(state, scene, camera, lights);
  drawGlScene(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A vertical bar from y=0 to y=2, four-corner rings at y = 0, 1, 2. Rings at y=0,1 weighted to joint 0
// (root); the top ring (y=2) to joint 1 (bend). Built in CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.
const halfWidth = 0.32;
const ringY = [0, 1, 2];
const ringJoint = [0, 0, 1];
const cornerX = [-halfWidth, halfWidth, halfWidth, -halfWidth];
const cornerZ = [-halfWidth, -halfWidth, halfWidth, halfWidth];

// The morph target EXTENDS the bar downward: the bottom ring (y=0, root-weighted so the identity root
// leaves the morph delta intact) is pushed to y=-1.5. Deliberately ORTHOGONAL to the skin's sideways
// lean so the two deforms occupy separable screen regions — vertical extent proves morph, horizontal
// lean proves skin. Same interleaved layout as the base; only position (and a token normal) deltas set.
const baseExtendY = -1.5;

const STRIDE = 20;
const vertexCount = ringY.length * 4;
const vertices = new Float32Array(vertexCount * STRIDE);
const morphPositionDeltas = new Float32Array(vertexCount * 3);
for (let r = 0; r < ringY.length; r++) {
  for (let c = 0; c < 4; c++) {
    const v = r * 4 + c;
    const base = v * STRIDE;
    vertices[base + 0] = cornerX[c];
    vertices[base + 1] = ringY[r];
    vertices[base + 2] = cornerZ[c];
    vertices[base + 3] = cornerX[c];
    vertices[base + 4] = 0;
    vertices[base + 5] = cornerZ[c];
    vertices[base + 8] = 1; // tangent (unused by unlit)
    vertices[base + 12] = ringJoint[r]; // joints0 — single full-weight influence
    vertices[base + 16] = 1; // weights0
    // Only the bottom ring is pushed down, extending the bar below its bind base.
    if (r === 0) morphPositionDeltas[v * 3 + 1] = baseExtendY;
  }
}

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

const morph: MeshMorph = {
  targets: [{ normalDeltas: null, positionDeltas: morphPositionDeltas, tangentDeltas: null }],
  weights: new Float32Array([1]),
};

// Two joints: a stationary root at the origin, and a bend joint parented mid-height carrying the pose
// rotation. Inverse-bind matrices are captured at the REST pose (bend unrotated) so the palette is a real
// non-identity deform once the bend is rotated after skeleton construction. The mesh starts at morph
// weight 0 (bar un-extended) — the render sequence below raises it to 1 across a second frame, which is
// what actually exercises the freeze bug (see render sequence).
function buildComposedScene(bendAngle: number): { scene: SceneNode; mesh: Mesh } {
  const root = createSceneNode();
  const bend = createSceneNode();
  setVector3(bend.position, 0, 1, 0);
  invalidateNodeLocalTransform(bend);
  addNodeChild(root, bend);

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
  mesh.morph = { targets: morph.targets, weights: new Float32Array([0]) };
  addNodeChild(scene, mesh);
  return { scene, mesh };
}

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 1, 5), createVector3(0, 1, 0), createVector3(0, 1, 0));

const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = {
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
};

// One render at full morph weight. This scene is the end-to-end COMPOSE proof — a skinned+morphed mesh
// rendering both deforms together on the GPU. The freeze-across-frames regression (that a LATER morph
// weight re-feeds the skinned upload rather than being pinned at the first upload) is locked precisely by
// the ensureGlMeshUpload unit test, which re-uploads across a version bump; the functional harness reads
// back the first rendered frame, so it proves the composed draw is correct, not the multi-frame re-upload.
const { scene: composedScene, mesh: composedMesh } = buildComposedScene((75 * Math.PI) / 180);
composedMesh.morph!.weights[0] = 1;
render(composedScene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const w = surface.width;
  const h = surface.height;
  const covered = (fx: number, fy: number): boolean =>
    getSurfacePixelLuminance(surface, Math.floor(w * fx), Math.floor(h * fy)) > 90;

  // Morph-composed probe: deep in the downward-extended base column (well below where the un-morphed bar
  // ends at y=0). The base ring is root-weighted — the identity root leaves the morph delta intact — so
  // coverage here is PURELY the morph. Background here means the morph was discarded: the freeze bug
  // (skinBindUploaded pinning the buffer at frame 0) drops the per-frame morph delta.
  if (!covered(0.5, 0.82)) {
    throw new Error(
      '[scene-skin-morph-compose] morph-extension probe (0.5,0.82) is background — the morph was discarded (skin bind buffer frozen, morph deltas not composed onto the GPU-skinned draw)',
    );
  }

  // Skin-composed probe: the leaned upper arm displaced off the vertical axis (the 75° bend about +Z).
  // The top ring is bend-weighted and untouched by the morph, so coverage left of the bar's axis is
  // PURELY the skin. Background here means the skin did not deform.
  if (!covered(0.36, 0.42)) {
    throw new Error(
      '[scene-skin-morph-compose] leaned-arm probe (0.36,0.42) is background — the skin did not deform (bone palette not uploaded/sampled)',
    );
  }

  // Sanity: the bar's central column is present.
  if (!covered(0.5, 0.65)) {
    throw new Error('[scene-skin-morph-compose] base (0.5,0.65) is background — the bar is missing entirely');
  }
}
