import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { drawWgpuScene3D, registerWgpuGpuSkinning } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
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
  createScene3D,
  createNode3D,
  createSkeleton3D,
  createUnlitMaterial,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  scene2dWgpuPipeline,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  invalidateNodeLocalTransform,
  normalizeVector3,
  prepareScene3DRender,
  prepareScene3DSkinning,
  registerWgpuUnlitMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setQuaternionFromAxisAngle,
  setVector3,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field, one flat orange bar rises from a stationary vertical base near ' +
    'the lower centre, then bends about 75 degrees toward screen-left above its midpoint. The leaned ' +
    'upper arm covers roughly (38%,43%), while the straight bind-pose location near top-centre ' +
    '(50%,20%) is empty and the lower base remains present near (53%,65%). The bar is one continuous ' +
    'solid silhouette: it is not straight upright, detached at the joint, missing its base or ' +
    'duplicated.',
);

// WebGPU mirror of scene-skinning.webgl: the posed silhouette can only reach the leaned-arm probe
// when the rgba32float joint palette is uploaded and sampled by the HAS_SKIN vertex variant.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, scene2dWgpuPipeline, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
});
registerWgpuUnlitMaterial(state);
registerWgpuGpuSkinning(state);
const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  prepareScene3DSkinning(scene);
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

const halfWidth = 0.22;
const ringY = [0, 1, 2];
const bendJointIndex = 79;
const ringJoint = [0, 0, bendJointIndex];
const cornerX = [-halfWidth, halfWidth, halfWidth, -halfWidth];
const cornerZ = [-halfWidth, -halfWidth, halfWidth, halfWidth];
const stride = 20;
const vertices = new Float32Array(ringY.length * 4 * stride);
for (let ring = 0; ring < ringY.length; ring++) {
  for (let corner = 0; corner < 4; corner++) {
    const base = (ring * 4 + corner) * stride;
    vertices[base] = cornerX[corner];
    vertices[base + 1] = ringY[ring];
    vertices[base + 2] = cornerZ[corner];
    vertices[base + 3] = cornerX[corner];
    vertices[base + 5] = cornerZ[corner];
    vertices[base + 8] = 1;
    vertices[base + 12] = ringJoint[ring];
    vertices[base + 16] = 1;
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

const material = createUnlitMaterial({ baseColor: 0xff8030ff });
const root = createNode3D();
const bend = createNode3D();
setVector3(bend.position, 0, 1, 0);
invalidateNodeLocalTransform(bend);
addNodeChild(root, bend);
// Keep the deforming joint above the former 64-joint uniform-array ceiling. The 78 identity filler
// joints are unused influences, but force a real 80-matrix data-texture upload before joint 79 is read.
const joints = [root];
for (let index = 1; index < bendJointIndex; index++) {
  const filler = createNode3D();
  addNodeChild(root, filler);
  joints.push(filler);
}
joints.push(bend);
const skeleton = createSkeleton3D(joints);
const rotation = createQuaternion();
setQuaternionFromAxisAngle(rotation, createVector3(0, 0, 1), (75 * Math.PI) / 180);
copyQuaternion(bend.rotation, rotation);
invalidateNodeLocalTransform(bend);

const scene = createScene3D().root;
addNodeChild(scene, root);
const geometry = createMeshGeometry({
  indices: new Uint16Array(indices),
  layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  vertices,
});
const mesh = createMesh(geometry, [material]);
mesh.skin = { skeleton };
addNodeChild(scene, mesh);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 1, 5), createVector3(0, 1, 0), createVector3(0, 1, 0));
const direction = createVector3(-1, -0.35, -0.55);
normalizeVector3(direction, direction);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction, intensity: 1 }),
});
render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const covered = (x: number, y: number): boolean =>
    getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * x), Math.floor(bitmap.height * y)) > 90;
  if (!covered(0.38, 0.43)) throw new Error('[scene-skinning] posed leaned-arm probe is background');
  if (covered(0.5, 0.2)) throw new Error('[scene-skinning] top-center remains in the rigid bind pose');
  if (!covered(0.53, 0.65)) throw new Error('[scene-skinning] stationary root-weighted base is missing');
}
