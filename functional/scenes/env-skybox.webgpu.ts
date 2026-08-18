import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuEnvironmentSkybox, drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Environment, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createCubeTexture,
  createDirectionalLight,
  createEnvironment,
  createImageResourceFromCanvas,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createStandardPbrMaterial,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixel,
  prepareScene3DRender,
  registerWgpuStandardPbrMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setCubeTextureFace,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'An 800x600 field whose BACKDROP IS NOT FLAT: the area behind the subject varies from top to left ' +
    'to right rather than being one uniform colour, so the frame reads as an environment surrounding ' +
    'the scene instead of a plain fill. A uniform backdrop of a single colour anywhere across those ' +
    'three regions is the failure, and a blank backdrop is a worse one. In front of it sits a single ' +
    'matte grey sphere, centred, of moderate size — about a quarter of the frame height across — shaded ' +
    'so one side is clearly brighter than the other rather than flat. The sphere has no mirror-like ' +
    'reflection of its surroundings: it is rough, not polished.',
);
// WebGPU mirror of env-skybox.webgl: distinct procedural cube faces must vary across reconstructed
// view rays rather than collapsing to a flat backdrop.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);
export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerWgpuStandardPbrMaterial(state);
const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});
export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLights>,
  environment: Readonly<Environment>,
): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  drawWgpuEnvironmentSkybox(state, environment, camera, width / height);
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

const colors = ['#ff3030', '#30ff30', '#f0f0f0', '#303030', '#3030ff', '#ffe030'];
const cube = createCubeTexture();
for (let face = 0; face < colors.length; face++) {
  setCubeTextureFace(cube, face, createImageResourceFromCanvas(solidFaceCanvas(colors[face])));
}
const environment = createEnvironment({ environment: cube, intensity: 1 });
const scene = createScene3D().root;
addNodeChild(
  scene,
  createMesh(createSphereMeshGeometry(0.8, 32, 24), [
    createStandardPbrMaterial({ baseColor: 0x808080ff, metallic: 0, roughness: 0.5 }),
  ]),
);
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 2.2 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, -0.4, 0), createVector3(0, 1, 0));
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x808080ff, intensity: 0.5 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(-0.4, -1, -0.3), intensity: 1.5 }),
});
render(scene, camera, lights, environment);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const top = getBitmapPixel(bitmap, Math.floor(bitmap.width * 0.5), Math.floor(bitmap.height * 0.12));
  const left = getBitmapPixel(bitmap, Math.floor(bitmap.width * 0.08), Math.floor(bitmap.height * 0.5));
  const right = getBitmapPixel(bitmap, Math.floor(bitmap.width * 0.92), Math.floor(bitmap.height * 0.5));
  if (blank(top) && blank(left) && blank(right)) throw new Error('[env-skybox] backdrop is blank');
  if (sameColor(top, left) && sameColor(left, right)) throw new Error('[env-skybox] backdrop is uniform');
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

function channel(pixel: number, shift: number): number {
  return (pixel >>> shift) & 0xff;
}
function blank(pixel: number): boolean {
  return channel(pixel, 24) < 24 && channel(pixel, 16) < 24 && channel(pixel, 8) < 24;
}
function sameColor(a: number, b: number): boolean {
  return (
    Math.abs(channel(a, 24) - channel(b, 24)) < 24 &&
    Math.abs(channel(a, 16) - channel(b, 16)) < 24 &&
    Math.abs(channel(a, 8) - channel(b, 8)) < 24
  );
}
