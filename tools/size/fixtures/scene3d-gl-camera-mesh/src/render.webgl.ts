import { createCamera3D, createPerspectiveProjection, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3DLights } from '@flighthq/lighting';
import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
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
import { createMesh, createScene3D } from '@flighthq/scene3d';
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

const scene = createScene3D().root;
addNodeChild(scene, createMesh(createBoxMeshGeometry(1, 1, 1), [createUnlitMaterial({ baseColor: 0x3ddc97ff })]));
const camera = createCamera3D({
  far: 10,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: 4 / 3, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(2, 1.5, 2.5), createVector3(0, 0, 0), createVector3(0, 1, 0));
const lights = createScene3DLights();

renderGlBackground(state);
state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
prepareScene3DRender(state, scene, camera, lights);
drawGlScene3D(state, scene, camera, lights);

Reflect.set(globalThis, '__flightScene3dGlCameraMesh', { camera, scene, state });
