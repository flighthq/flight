import { createBitmap } from '@flighthq/bitmap';
import { createCamera3D, createPerspectiveProjection, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3DLights } from '@flighthq/lighting';
import { createUnlitMaterial } from '@flighthq/materials';
import { CANONICAL_MESH_GEOMETRY_LAYOUT, createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene3DRender } from '@flighthq/render';
import {
  createWgpuCanvasElement,
  createWgpuPipeline,
  createWgpuRenderStateFromCanvasElement,
  registerWgpuBitmapTextureResolver,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRegistries } from '@flighthq/render-wgpu/contract';
import { createMesh, createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D, unlitWgpuMeshMaterialRenderer } from '@flighthq/scene3d-wgpu';
import { createTexture2D } from '@flighthq/texture';
import { UnlitMaterialKind } from '@flighthq/types';

enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(320, 240, 1);
document.body.style.margin = '0';
document.body.appendChild(canvas);

const registries = createEmptyWgpuRegistries();
const pipeline = createWgpuPipeline({
  ...registries,
  meshMaterialRenderers: withRegistryTableEntry(
    registries.meshMaterialRenderers,
    UnlitMaterialKind,
    unlitWgpuMeshMaterialRenderer,
  ),
});
const state = await createWgpuRenderStateFromCanvasElement(canvas, pipeline, {
  antialias: false,
  backgroundColor: 0x101522ff,
  pixelRatio: 1,
});
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

export { camera, lights, scene, state };

renderWgpuBackground(state);
prepareScene3DRender(state, scene, camera, lights);
drawWgpuScene3D(state, scene, camera, lights);
submitWgpuRenderPass(state);

Reflect.set(globalThis, '__flightScene3dWgpuTexturedMesh', { scene, state, texture });
