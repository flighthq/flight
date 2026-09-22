import { createAppWindow, openWindow } from '@flighthq/app';
import { createBitmap } from '@flighthq/bitmap';
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
import { withKindMapEntry } from '@flighthq/registry';
import { prepareScene3DRender } from '@flighthq/render';
import {
  beginWgpuRenderPass,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderPass,
  registerWgpuBitmapTextureResolver,
} from '@flighthq/render-wgpu';
import { allocateEmptyWgpuRenderRegistries } from '@flighthq/render-wgpu/contract';
import { createMesh, createScene3D } from '@flighthq/scene3d';
import { renderWgpuScene3D, wgpuUnlitMeshMaterialRenderer } from '@flighthq/scene3d-wgpu';
import { createWgpuSurface } from '@flighthq/surface';
import { createTexture2D } from '@flighthq/texture';
import { UnlitMaterialKind } from '@flighthq/types';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const wgpuSurface = await createWgpuSurface(webHostWgpuContext, appWindow, 320, 240);
if (wgpuSurface === null) throw new Error('WebGPU is unavailable in this environment');
document.body.style.margin = '0';
appendWebSurface(wgpuSurface, document.body);

const registries = allocateEmptyWgpuRenderRegistries();
const registry = {
  ...registries,
  materialRenderers: withKindMapEntry(registries.materialRenderers, UnlitMaterialKind, wgpuUnlitMeshMaterialRenderer),
};

const acquisition = wgpuSurface.acquisition;
export const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, wgpuSurface, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, registry, { format: acquisition.format, pixelRatio: 1 });
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
export const screenClear = { color: [0x10 / 0xff, 0x15 / 0xff, 0x22 / 0xff, 1], depth: 1.0 } as const;
registerWgpuBitmapTextureResolver(state);

const bitmap = createBitmap(2, 2);
bitmap.data.set([255, 64, 64, 255, 64, 220, 150, 255, 64, 130, 255, 255, 255, 220, 64, 255]);
const texture = createTexture2D({ source: bitmap });
const geometry = createMeshGeometry({
  indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  layout: CANONICAL_MESH_GEOMETRY_LAYOUT,
  vertices: new Float32Array([
    -1, -0.75, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, -0.75, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0.75, 0, 0, 0, 1, 1, 0, 0, 1, 1,
    0, -1, 0.75, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0,
  ]),
});
const scene = createScene3D().root;
addNodeChild(
  scene,
  createMesh(geometry, [createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: texture, doubleSided: true })]),
);
const camera = createCamera3D({
  far: 10,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: 4 / 3, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));
const lights = createScene3DLights();

export { camera, lights, scene };

const pass = beginWgpuRenderPass(state, screen, screenClear);
prepareScene3DRender(state, scene, camera, lights);
renderWgpuScene3D(pass, scene, camera, lights);
endWgpuRenderPass(pass);

Reflect.set(globalThis, '__flightScene3dWgpuTexturedMesh', { scene, state, texture });
