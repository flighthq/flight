import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createBlinnPhongMaterial,
  createCamera3D,
  createHemisphereLight,
  createMesh,
  createPerspectiveProjection,
  createScene3DLights,
  createSphereMeshGeometry,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  scene2dWgpuPipeline,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  prepareScene3DRender,
  registerWgpuBlinnPhongMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 field on a near-black background with a single grey sphere centred in it, about 245 px across — D ' +
    '= H*tan(asin(0.5/3))/tan(pi/8) = 0.408*H — centred at (0.5*W, 0.5*H) = (400,300), lit FROM ABOVE AND BELOW ' +
    'BY DIFFERENT LIGHT: its upper half is warm and clearly brighter, its lower half is much darker and cooler, ' +
    'with a smooth gradient between the two rather than a hard line. The top-versus-bottom difference is the ' +
    'claim — a sphere lit evenly, or one brighter at the bottom, is the failure. There is no single hard-edged ' +
    'highlight of the kind a lamp makes; the shading is broad and soft. The background stays near-black.',
);
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, scene2dWgpuPipeline, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
});
registerWgpuBlinnPhongMaterial(state);
const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

const geometry = createSphereMeshGeometry(0.5, 48, 32);
const material = createBlinnPhongMaterial({ diffuse: 0x808080ff, specular: 0x808080ff, shininess: 32 });
const scene = createScene3D().root;
addNodeChild(scene, createMesh(geometry, [material]));
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

const lights = createScene3DLights({
  hemisphere: [createHemisphereLight({ groundColor: 0x101014ff, intensity: 3, skyColor: 0xfff0e0ff })],
});
render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  const offset = Math.floor(bitmap.height * 0.1);
  const skyLuminance = getBitmapPixelLuminance(bitmap, cx, cy - offset);
  const groundLuminance = getBitmapPixelLuminance(bitmap, cx, cy + offset);

  if (skyLuminance <= 24) {
    throw new Error(`[light-hemisphere] top is blank (luminance ${skyLuminance}) — hemisphere light did not shade`);
  }
  if (skyLuminance <= groundLuminance + 24) {
    throw new Error(
      `[light-hemisphere] no sky/ground gradient: top (${skyLuminance}) is not clearly brighter than bottom (${groundLuminance})`,
    );
  }
}
