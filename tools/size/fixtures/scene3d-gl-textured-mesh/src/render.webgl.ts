import { createBitmap } from '@flighthq/bitmap';
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
  registerGlBitmapTextureResolver,
  renderGlBackground,
} from '@flighthq/render-gl';
import { createMesh, createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D, unlitGlMeshMaterialRenderer } from '@flighthq/scene3d-gl';
import { createTexture2D } from '@flighthq/texture';
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
registerGlBitmapTextureResolver(state);

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

renderGlBackground(state);
state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
prepareScene3DRender(state, scene, camera, lights);
drawGlScene3D(state, scene, camera, lights);

Reflect.set(globalThis, '__flightScene3dGlTexturedMesh', { scene, state, texture });
