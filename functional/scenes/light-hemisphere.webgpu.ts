import { createScene3D } from '@flighthq/scene';
import { drawWgpuScene3D } from '@flighthq/scene-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Surface } from '@flighthq/sdk';
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
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getSurfacePixelLuminance,
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

const lights = createScene3DLights({
  hemisphere: [createHemisphereLight({ groundColor: 0x101014ff, intensity: 3, skyColor: 0xfff0e0ff })],
});
render(scene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  const offset = Math.floor(surface.height * 0.1);
  const skyLuminance = getSurfacePixelLuminance(surface, cx, cy - offset);
  const groundLuminance = getSurfacePixelLuminance(surface, cx, cy + offset);

  if (skyLuminance <= 24) {
    throw new Error(`[light-hemisphere] top is blank (luminance ${skyLuminance}) — hemisphere light did not shade`);
  }
  if (skyLuminance <= groundLuminance + 24) {
    throw new Error(
      `[light-hemisphere] no sky/ground gradient: top (${skyLuminance}) is not clearly brighter than bottom (${groundLuminance})`,
    );
  }
}
