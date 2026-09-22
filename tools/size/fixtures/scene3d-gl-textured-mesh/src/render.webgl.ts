import { createAppWindow, openWindow } from '@flighthq/app';
import { createBitmap } from '@flighthq/bitmap';
import { createCamera3D, createPerspectiveProjection, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { webHostGl, appendWebSurface, webHostWindowGeometry, webHostWindowLifecycle } from '@flighthq/host-web';
import { createScene3DLights } from '@flighthq/lighting';
import { createUnlitMaterial } from '@flighthq/materials';
import { CANONICAL_MESH_GEOMETRY_LAYOUT, createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { withKindMapEntry } from '@flighthq/registry';
import { prepareScene3DRender } from '@flighthq/render';
import {
  allocateEmptyGlRenderRegistries,
  createGlRenderState,
  registerGlBitmapTextureResolver,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/render-gl';
import { createMesh, createScene3D } from '@flighthq/scene3d';
import { renderGlScene3D, glUnlitMeshMaterialRenderer } from '@flighthq/scene3d-gl';
import { createGlSurface } from '@flighthq/surface';
import { createTexture2D } from '@flighthq/texture';
import { UnlitMaterialKind } from '@flighthq/types';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 320, 240, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
appendWebSurface(glSurface, document.body);
document.body.style.margin = '0';

const registries = allocateEmptyGlRenderRegistries();
const registry = {
  ...registries,
  materialRenderers: withKindMapEntry(registries.materialRenderers, UnlitMaterialKind, glUnlitMeshMaterialRenderer),
};
const state = createGlRenderState(glSurface.context, registry, { pixelRatio: 1 });
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

state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
prepareScene3DRender(state, scene, camera, lights);
const screenTarget = createGlScreenRenderTarget(state.gl);
const pass = beginGlRenderPass(state, screenTarget);
renderGlScene3D(pass, scene, camera, lights);
endGlRenderPass(pass);

Reflect.set(globalThis, '__flightScene3dGlTexturedMesh', { scene, state, texture });
