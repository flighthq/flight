import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { bakeWgpuEnvironmentIbl, drawWgpuEnvironmentSkybox, drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Environment, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createCamera3D,
  createCubeTexture,
  createEnvironment,
  createImageResourceFromCanvas,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createStandardPbrMaterial,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  scene2dWgpuPipeline,
  endWgpuRenderEffectPipeline,
  getBitmapPixel,
  getBitmapPixelLuminance,
  invalidateNodeLocalTransform,
  prepareScene3DRender,
  registerWgpuStandardPbrMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setCubeTextureFace,
  setVector3,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 environment backdrop surrounds two large spheres centred near (243,300) and ' +
    '(557,300). The backdrop is assembled from strong red, green, near-white, dark grey-violet, blue ' +
    'and yellow faces. The left sphere is a very smooth metal: it is brightly lit and carries visibly ' +
    'different reflected face colours across its surface rather than one flat tone. The right sphere ' +
    'is a rough grey non-metal with a softer diffuse environment tint and little sharp reflection. ' +
    'Neither sphere is black, there is no punctual-light spot, and the near-black clear colour does ' +
    'not replace the environment behind them.',
);

// WebGPU mirror of env-ibl.webgl: two PBR spheres have no punctual lights, so visible diffuse and
// specular response can only come from the baked environment set.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);
export const state = await createWgpuRenderStateFromCanvasElement(canvas, scene2dWgpuPipeline, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
});
registerWgpuStandardPbrMaterial(state);
const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});
export const scale = pixelRatio;
export const width = 800;
export const height = 600;
let baked = false;

export function render(
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLights>,
  environment: Readonly<Environment>,
): void {
  if (!baked) {
    bakeWgpuEnvironmentIbl(state, environment);
    baked = true;
  }
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  drawWgpuEnvironmentSkybox(state, environment, camera, width / height);
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

const colors = ['#ff3030', '#30ff30', '#f0f0f0', '#505060', '#3030ff', '#ffe030'];
const cube = createCubeTexture();
for (let face = 0; face < colors.length; face++) {
  setCubeTextureFace(cube, face, createImageResourceFromCanvas(solidFaceCanvas(colors[face])));
}
const environment = createEnvironment({ environment: cube, intensity: 1 });
const scene = createScene3D().root;
const metal = createMesh(createSphereMeshGeometry(0.9, 48, 32), [
  createStandardPbrMaterial({ baseColor: 0xffffffff, metallic: 1, roughness: 0.06 }),
]);
setVector3(metal.position, -1.15, 0, 0);
invalidateNodeLocalTransform(metal);
addNodeChild(scene, metal);
const rough = createMesh(createSphereMeshGeometry(0.9, 48, 32), [
  createStandardPbrMaterial({ baseColor: 0xb0b0b0ff, metallic: 0, roughness: 0.65 }),
]);
setVector3(rough.position, 1.15, 0, 0);
invalidateNodeLocalTransform(rough);
addNodeChild(scene, rough);
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 3.4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4.6), createVector3(0, 0, 0), createVector3(0, 1, 0));
render(scene, camera, createScene3DLights({ ambient: null, directional: null }), environment);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const centerY = Math.floor(bitmap.height * 0.5);
  const metalLuma = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * 0.32), centerY);
  const roughLuma = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * 0.68), centerY);
  if (metalLuma <= 24) throw new Error(`[env-ibl] metal sphere is unlit (${metalLuma})`);
  if (roughLuma <= 24) throw new Error(`[env-ibl] rough sphere is unlit (${roughLuma})`);
  const a = getBitmapPixel(bitmap, Math.floor(bitmap.width * 0.27), centerY);
  const b = getBitmapPixel(bitmap, Math.floor(bitmap.width * 0.37), Math.floor(bitmap.height * 0.4));
  if (sameColor(a, b)) throw new Error('[env-ibl] metal sphere has no reflection variation');
}

function solidFaceCanvas(color: string): HTMLCanvasElement {
  const face = document.createElement('canvas');
  face.width = 8;
  face.height = 8;
  const context = face.getContext('2d')!;
  context.fillStyle = color;
  context.fillRect(0, 0, 8, 8);
  return face;
}
function sameColor(a: number, b: number): boolean {
  return (
    Math.abs(((a >>> 24) & 0xff) - ((b >>> 24) & 0xff)) < 24 &&
    Math.abs(((a >>> 16) & 0xff) - ((b >>> 16) & 0xff)) < 24 &&
    Math.abs(((a >>> 8) & 0xff) - ((b >>> 8) & 0xff)) < 24
  );
}
