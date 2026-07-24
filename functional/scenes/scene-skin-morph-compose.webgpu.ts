import { drawWgpuScene, registerWgpuGpuSkinning } from '@flighthq/scene-wgpu';
import type { Camera3D, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  copyQuaternion,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createMeshGeometry,
  createPerspectiveProjection,
  createQuaternion,
  createScene,
  createSceneNode,
  createSkeleton3D,
  createUnlitMaterial,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getSurfacePixelLuminance,
  invalidateNodeLocalTransform,
  normalizeVector3,
  prepareSceneMorph,
  prepareSceneRender,
  prepareSceneSkinning,
  registerUnlitWgpuMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setQuaternionFromAxisAngle,
  setVector3,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// WebGPU compose proof: morph extends the root-weighted base vertically while skinning bends the
// joint-weighted top horizontally. Separate probes require both deformation paths in one draw.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerUnlitWgpuMaterial(state);
registerWgpuGpuSkinning(state);
const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});
export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<SceneNode>, camera: Readonly<Camera3D>, lights: Readonly<SceneLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  prepareSceneMorph(scene);
  prepareSceneSkinning(scene);
  prepareSceneRender(state, scene, camera, lights);
  drawWgpuScene(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

const ringY = [0, 1, 2];
const ringJoint = [0, 0, 1];
const cornerX = [-0.32, 0.32, 0.32, -0.32];
const cornerZ = [-0.32, -0.32, 0.32, 0.32];
const stride = 20;
const vertices = new Float32Array(ringY.length * 4 * stride);
const positionDeltas = new Float32Array(ringY.length * 4 * 3);
for (let ring = 0; ring < ringY.length; ring++) {
  for (let corner = 0; corner < 4; corner++) {
    const vertex = ring * 4 + corner;
    const base = vertex * stride;
    vertices[base] = cornerX[corner];
    vertices[base + 1] = ringY[ring];
    vertices[base + 2] = cornerZ[corner];
    vertices[base + 3] = cornerX[corner];
    vertices[base + 5] = cornerZ[corner];
    vertices[base + 8] = 1;
    vertices[base + 12] = ringJoint[ring];
    vertices[base + 16] = 1;
    if (ring === 0) positionDeltas[vertex * 3 + 1] = -1.5;
  }
}
const indices: number[] = [];
for (let ring = 0; ring < ringY.length - 1; ring++) {
  for (let corner = 0; corner < 4; corner++) {
    const a = ring * 4 + corner;
    const b = ring * 4 + ((corner + 1) % 4);
    const nextA = (ring + 1) * 4 + corner;
    const nextB = (ring + 1) * 4 + ((corner + 1) % 4);
    indices.push(a, b, nextB, a, nextB, nextA);
  }
}

const root = createSceneNode();
const bend = createSceneNode();
setVector3(bend.position, 0, 1, 0);
invalidateNodeLocalTransform(bend);
addNodeChild(root, bend);
const skeleton = createSkeleton3D([root, bend]);
const rotation = createQuaternion();
setQuaternionFromAxisAngle(rotation, createVector3(0, 0, 1), (75 * Math.PI) / 180);
copyQuaternion(bend.rotation, rotation);
invalidateNodeLocalTransform(bend);

const geometry = createMeshGeometry({
  indices: new Uint16Array(indices),
  layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  vertices,
});
const mesh = createMesh(geometry, [createUnlitMaterial({ baseColor: 0xff8030ff })]);
mesh.skin = { skeleton };
mesh.morph = {
  targets: [{ normalDeltas: null, positionDeltas, tangentDeltas: null }],
  weights: new Float32Array([1]),
};
const scene = createScene().root;
addNodeChild(scene, root);
addNodeChild(scene, mesh);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 1, 5), createVector3(0, 1, 0), createVector3(0, 1, 0));
const direction = createVector3(-1, -0.35, -0.55);
normalizeVector3(direction, direction);
const lights = {
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction, intensity: 1 }),
};
render(scene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const covered = (x: number, y: number): boolean =>
    getSurfacePixelLuminance(surface, Math.floor(surface.width * x), Math.floor(surface.height * y)) > 90;
  if (!covered(0.5, 0.82)) throw new Error('[scene-skin-morph-compose] morph-extension probe is background');
  if (!covered(0.36, 0.42)) throw new Error('[scene-skin-morph-compose] leaned-arm probe is background');
  if (!covered(0.5, 0.65)) throw new Error('[scene-skin-morph-compose] base is background');
}
