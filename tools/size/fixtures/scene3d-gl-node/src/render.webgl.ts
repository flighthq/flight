import { createCamera3D, createPerspectiveProjection, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3DLights } from '@flighthq/lighting';
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
import { createNode3D, Node3DKind } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';

enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(320, 240, 1);
document.body.style.margin = '0';
document.body.appendChild(canvas);

const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, {
      contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
    }),
  ),
  createGlPipeline(createEmptyGlRegistries()),
  { backgroundColor: 0x101522ff, pixelRatio: 1 },
);
const scene = createNode3D(Node3DKind);
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

Reflect.set(globalThis, '__flightScene3dGlNode', { scene, state });
