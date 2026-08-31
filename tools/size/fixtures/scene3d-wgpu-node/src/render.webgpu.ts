import { createCamera3D, createPerspectiveProjection, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3DLights } from '@flighthq/lighting';
import { prepareScene3DRender } from '@flighthq/render';
import {
  createWgpuCanvasElement,
  createWgpuPipeline,
  createWgpuRenderStateFromCanvasElement,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRegistries } from '@flighthq/render-wgpu/contract';
import { createNode3D, Node3DKind } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';

enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(320, 240, 1);
document.body.style.margin = '0';
document.body.appendChild(canvas);

const state = await createWgpuRenderStateFromCanvasElement(canvas, createWgpuPipeline(createEmptyWgpuRegistries()), {
  antialias: false,
  backgroundColor: 0x101522ff,
  pixelRatio: 1,
});
const scene = createNode3D(Node3DKind);
const camera = createCamera3D({
  far: 10,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: 4 / 3, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));
const lights = createScene3DLights();

renderWgpuBackground(state);
prepareScene3DRender(state, scene, camera, lights);
drawWgpuScene3D(state, scene, camera, lights);
submitWgpuRenderPass(state);

Reflect.set(globalThis, '__flightScene3dWgpuNode', { scene, state });
