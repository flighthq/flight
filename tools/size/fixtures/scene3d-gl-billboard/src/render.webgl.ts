import { createCamera3D, createPerspectiveProjection, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3DLights } from '@flighthq/lighting';
import { createUnlitMaterial } from '@flighthq/materials';
import { CANONICAL_MESH_GEOMETRY_LAYOUT, createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene3DRender } from '@flighthq/render';
import {
  createEmptyGlRegistries,
  createGlCanvasElement,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlPipeline,
  createGlRenderState,
  renderGlBackground,
} from '@flighthq/render-gl';
import { createBillboard, createScene3D, orientScene3DBillboardsToCamera } from '@flighthq/scene3d';
import { drawGlScene3D, unlitGlMeshMaterialRenderer } from '@flighthq/scene3d-gl';
import { UnlitMaterialKind } from '@flighthq/types';

enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(320, 240, 1);
document.body.style.margin = '0';
document.body.appendChild(canvas);

const registries = createEmptyGlRegistries();
const pipeline = createGlPipeline({
  ...registries,
  meshMaterialRenderers: withRegistryTableEntry(
    registries.meshMaterialRenderers,
    UnlitMaterialKind,
    unlitGlMeshMaterialRenderer,
  ),
});
const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, {
      contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
    }),
  ),
  pipeline,
  { backgroundColor: 0x101522ff, pixelRatio: 1 },
);

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

renderGlBackground(state);
state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
orientScene3DBillboardsToCamera(scene, camera);
prepareScene3DRender(state, scene, camera, lights);
drawGlScene3D(state, scene, camera, lights);

Reflect.set(globalThis, '__flightScene3dGlBillboard', { scene, state });
