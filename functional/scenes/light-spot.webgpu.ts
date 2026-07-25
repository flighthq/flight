import { createScene3D } from '@flighthq/scene';
import { drawWgpuScene3D } from '@flighthq/scene-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createMesh,
  createPerspectiveProjection,
  createScene3DLights,
  createSphereMeshGeometry,
  createSpotLight,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getSurfacePixelLuminance,
  normalizeVector3,
  prepareScene3DRender,
  registerBlinnPhongWgpuMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerBlinnPhongWgpuMaterial(state);
const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
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

const spotDirection = createVector3(-1.3, -0.5, -1.6);
normalizeVector3(spotDirection, spotDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  spot: [
    createSpotLight({
      color: 0xffffffff,
      direction: spotDirection,
      innerConeDegrees: 12,
      intensity: 6,
      outerConeDegrees: 24,
      position: createVector3(1.3, 0.5, 1.6),
      range: -1,
    }),
  ],
});
render(scene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  const offset = Math.floor(surface.width * 0.075);
  const inConeLuminance = getSurfacePixelLuminance(surface, cx + offset, cy);
  const outConeLuminance = getSurfacePixelLuminance(surface, cx - offset, cy);

  if (inConeLuminance <= 24) {
    throw new Error(`[light-spot] in-cone side is blank (luminance ${inConeLuminance}) — spot light did not shade`);
  }
  if (inConeLuminance <= outConeLuminance + 24) {
    throw new Error(
      `[light-spot] no cone shading: in-cone side (${inConeLuminance}) is not clearly brighter than out-of-cone side (${outConeLuminance})`,
    );
  }
}
