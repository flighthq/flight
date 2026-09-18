import { createAppWindow, openWindow } from '@flighthq/app';
import { createCamera3D, createPerspectiveProjection, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import {
  webHostWgpuContext,
  appendWebSurface,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import { createScene3DLights } from '@flighthq/lighting';
import { prepareScene3DRender } from '@flighthq/render';
import {
  beginWgpuRenderPass,
  createWgpuPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderPass,
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRegistries } from '@flighthq/render-wgpu/contract';
import { createNode3D, Node3DKind } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import { createWgpuSurface } from '@flighthq/surface';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const wgpuSurface = await createWgpuSurface(webHostWgpuContext, appWindow, 320, 240);
if (wgpuSurface === null) throw new Error('WebGPU is unavailable in this environment');
appendWebSurface(wgpuSurface, document.body);
const acquisition = wgpuSurface.acquisition;
document.body.style.margin = '0';

export const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, wgpuSurface, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, createWgpuPipeline(createEmptyWgpuRegistries()), {
  format: acquisition.format,
  pixelRatio: 1,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x10 / 0xff, 0x15 / 0xff, 0x22 / 0xff, 1], depth: 1.0 } as const;
const scene = createNode3D(Node3DKind);
const camera = createCamera3D({
  far: 10,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: 4 / 3, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));
const lights = createScene3DLights();

const pass = beginWgpuRenderPass(state, screen, screenClear);
prepareScene3DRender(state, scene, camera, lights);
drawWgpuScene3D(pass, scene, camera, lights);
endWgpuRenderPass(pass);

Reflect.set(globalThis, '__flightScene3dWgpuNode', { scene, state });
