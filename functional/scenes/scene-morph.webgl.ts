import { drawGlScene } from '@flighthq/scene-gl';
import type { Camera3D, GlRenderEffectPipeline, MeshMorph, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  CANONICAL_MESH_GEOMETRY_LAYOUT,
  addNodeChild,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createMeshGeometry,
  createPerspectiveProjection,
  createScene,
  createUnlitMaterial,
  createVector3,
  beginGlRenderEffectPipeline,
  endGlRenderEffectPipeline,
  getSurfacePixelLuminance,
  normalizeVector3,
  prepareSceneRender,
  registerUnlitGlMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';

// scene-morph — exercises the GL vertex-morph draw path (updateMeshMorph, driven inside drawGlScene on the
// GL backend): a Mesh with a MeshMorph blends base + Σ wᵢ·targetᵢ into geometry.vertices each frame and the
// non-skinned GL upload re-uploads the deformed vertices (CPU-blend-then-upload; no HAS_MORPH shader
// permutation). A square quad's four corners carry a morph target that pushes them diagonally outward, so
// at full weight the quad grows into a larger diamond. Driving the `weights` array to 1 is the manual
// analogue of a glTF/MD2 `Weights` animation channel. The oracle asserts DEFORMATION vs the bind pose: a
// probe just outside the bind-pose quad silhouette (background at weight 0) is covered at weight 1. A morph
// path that failed to blend or re-upload would draw the bind-pose quad and the probe would stay background.
//
// drawGlScene collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu) — import the Gl one directly.
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

// A unit quad in the XY plane (z = 0), two triangles over four corners at ±0.5. Built in the canonical
// (non-skinned) layout — morph reads position from geometry.vertices and is layout-agnostic beyond that.
const half = 0.5;
const corners: readonly [number, number][] = [
  [-half, -half],
  [half, -half],
  [half, half],
  [-half, half],
];
const STRIDE = 12; // position(3) + normal(3) + tangent(4) + uv0(2)
const vertices = new Float32Array(corners.length * STRIDE);
for (let c = 0; c < corners.length; c++) {
  const base = c * STRIDE;
  vertices[base + 0] = corners[c][0];
  vertices[base + 1] = corners[c][1];
  vertices[base + 2] = 0;
  vertices[base + 5] = 1; // normal +z (unlit ignores it)
  vertices[base + 8] = 1; // tangent x
}
const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

// Morph target: push each corner diagonally outward by 0.6 (so full weight nearly doubles the quad's
// extent). Only positionDeltas — a glTF POSITION-only morph target. 3 floats per vertex, index-aligned.
const positionDeltas = new Float32Array(corners.length * 3);
for (let c = 0; c < corners.length; c++) {
  positionDeltas[c * 3 + 0] = Math.sign(corners[c][0]) * 0.6;
  positionDeltas[c * 3 + 1] = Math.sign(corners[c][1]) * 0.6;
}

const morph: MeshMorph = {
  targets: [{ normalDeltas: null, positionDeltas, tangentDeltas: null }],
  weights: new Float32Array([1]), // fully applied — the deformed shape
};

const geometry = createMeshGeometry({
  layout: CANONICAL_MESH_GEOMETRY_LAYOUT,
  vertices,
  indices,
});
const material = createUnlitMaterial({ baseColor: 0xff8030ff });

const scene = createScene().root;
const mesh = createMesh(geometry, [material]);
mesh.morph = morph;
addNodeChild(scene, mesh);

// A straight-on view down -Z so the quad reads as a screen-aligned square whose corners grow outward.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = {
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
};

render(scene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const w = surface.width;
  const h = surface.height;
  const covered = (fx: number, fy: number): boolean =>
    getSurfacePixelLuminance(surface, Math.floor(w * fx), Math.floor(h * fy)) > 90;

  // Center is on the quad in both poses (sanity).
  if (!covered(0.5, 0.5)) {
    throw new Error('[scene-morph] quad center (0.5,0.5) is background — the mesh is missing entirely');
  }

  // The bind-pose quad (half-extent 0.5) projects to roughly the central ~third of the frame; the morphed
  // quad (half-extent ~1.1) reaches far past that. A probe at 0.8 of the frame is outside the bind-pose
  // silhouette but inside the morphed one — covered ONLY when the morph blended+re-uploaded. This asserts
  // DEFORMATION, not just presence: an un-morphed bind-pose quad leaves this region background.
  if (!covered(0.8, 0.8)) {
    throw new Error(
      '[scene-morph] outer probe (0.8,0.8) is background — the morph did not deform the quad (blend/upload skipped)',
    );
  }

  // The morphed quad is still bounded (not a full-screen clear): the extreme corner of the frame is empty.
  if (covered(0.98, 0.02)) {
    throw new Error('[scene-morph] extreme frame corner (0.98,0.02) is covered — the quad silhouette is not bounded');
  }
}
