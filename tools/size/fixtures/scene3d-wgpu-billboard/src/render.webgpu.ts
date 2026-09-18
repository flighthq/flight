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
import { createUnlitMaterial } from '@flighthq/materials';
import { CANONICAL_MESH_GEOMETRY_LAYOUT, createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene3DRender } from '@flighthq/render';
import {
  beginWgpuRenderPass,
  createWgpuPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderPass,
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRegistries } from '@flighthq/render-wgpu/contract';
import { createBillboard, createScene3D, orientScene3DBillboardsToCamera } from '@flighthq/scene3d';
import { drawWgpuScene3D, unlitWgpuMeshMaterialRenderer } from '@flighthq/scene3d-wgpu';
import { createWgpuSurface } from '@flighthq/surface';
import { UnlitMaterialKind } from '@flighthq/types';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const wgpuSurface = await createWgpuSurface(webHostWgpuContext, appWindow, 320, 240);
if (wgpuSurface === null) throw new Error('WebGPU is unavailable in this environment');
document.body.style.margin = '0';
appendWebSurface(wgpuSurface, document.body);

const registries = createEmptyWgpuRegistries();
const pipeline = createWgpuPipeline({
  ...registries,
  meshMaterialRenderers: withRegistryTableEntry(
    registries.meshMaterialRenderers,
    UnlitMaterialKind,
    unlitWgpuMeshMaterialRenderer,
  ),
});

const acquisition = wgpuSurface.acquisition;
export const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, wgpuSurface, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, pipeline, { format: acquisition.format, pixelRatio: 1 });
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
export const screenClear = { color: [0x10 / 0xff, 0x15 / 0xff, 0x22 / 0xff, 1], depth: 1.0 } as const;

const geometry = createMeshGeometry({
  layout: CANONICAL_MESH_GEOMETRY_LAYOUT,
  vertices: new Float32Array([
    -0.9, -0.7, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0.9, -0.7, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0.9, 0, 0, 0, 1, 1, 0, 0, 1,
    0.5, 0,
  ]),
});
const scene = createScene3D().root;
addNodeChild(scene, createBillboard(geometry, [createUnlitMaterial({ baseColor: 0x43c8ffff })], 'screenAligned'));
const camera = createCamera3D({
  far: 10,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: 4 / 3, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));
const lights = createScene3DLights();

export { camera, lights, scene };

const pass = beginWgpuRenderPass(state, screen, screenClear);
orientScene3DBillboardsToCamera(scene, camera);
prepareScene3DRender(state, scene, camera, lights);
drawWgpuScene3D(pass, scene, camera, lights);
endWgpuRenderPass(pass);

Reflect.set(globalThis, '__flightScene3dWgpuBillboard', { scene, state });
