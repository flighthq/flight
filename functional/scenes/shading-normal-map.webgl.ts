import {
  webHostGl,
  createWebImageResourceFromCanvas,
  appendWebSurface,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Bitmap, Camera3D, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  createGlSurface,
  addNodeChild,
  beginGlEffectState,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createDissolveModifier,
  createEnvReflectModifier,
  createFogModifier,
  createGlEffectState,
  createGlRenderState,
  createMesh,
  createPerspectiveProjection,
  createScene3DLights,
  createShadedMaterial,
  createTexture,
  createToonModifier,
  createVector3,
  createVertexDisplaceModifier,
  endGlEffectState,
  getBitmapPixelLuminance,
  normalizeVector3,
  prepareScene3DRender,
  defaultScene3DGlRenderRegistry,
  setCamera3DViewMatrix4FromLookAt,
  VertexDisplaceModifierSource,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an 800×600 near-black navy field (about R8 G11 B18), one large pale blue, shallow box faces ' +
    'the viewer at the centre. Its front is split vertically by two authored tangent-space normals: ' +
    'the LEFT half is clearly brighter than the right by more than 25 luminance levels, while both ' +
    'halves retain stepped blue-grey shading. The split is a lighting change rather than a gap or ' +
    'colour bar; the box remains one continuous square silhouette. No uniform single shade, reversed ' +
    'brightness order, extra geometry or full-field clear is present.',
);

const pixelRatio = window.devicePixelRatio || 1;
const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 800 * pixelRatio, 600 * pixelRatio, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
setSurfaceDisplaySize(webHostSurfaceDisplay, glSurface, 800, 600);
appendWebSurface(glSurface, document.body);

export const state = createGlRenderState(glSurface.context, defaultScene3DGlRenderRegistry, {
  pixelRatio,
});

const pipeline = createGlEffectState(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

const screenClear = { color: [0x08 / 0xff, 0x0b / 0xff, 0x12 / 0xff, 1], depth: 1.0 } as const;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  const pass = beginGlEffectState(state, pipeline, 'linear', screenClear);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(pass, scene, camera, lights);
  endGlEffectState(pass, pipeline, []);
}

const normalSource = document.createElement('canvas');
normalSource.width = 64;
normalSource.height = 64;
const normalContext = normalSource.getContext('2d')!;
normalContext.fillStyle = '#e080d0';
normalContext.fillRect(0, 0, 32, 64);
normalContext.fillStyle = '#2080d0';
normalContext.fillRect(32, 0, 32, 64);

const material = createShadedMaterial({
  diffuse: 0xb0c8e0ff,
  normalMap: createTexture({
    colorSpace: 'linear',
    dimension: '2d',
    source: createWebImageResourceFromCanvas(normalSource),
  }),
  normalScale: 1,
  modifiers: [
    createVertexDisplaceModifier({
      amplitude: 0,
      source: VertexDisplaceModifierSource.Sine,
    }),
    createDissolveModifier({ threshold: 0 }),
    createEnvReflectModifier({ intensity: 0 }),
    createFogModifier({ color: 0x000000ff, far: 1000 }),
    createToonModifier({ steps: 8, smoothness: 0.1 }),
  ],
  shininess: 12,
  specular: 0x202020ff,
});

const scene = createScene3D().root;
addNodeChild(scene, createMesh(createBoxMeshGeometry(2.4, 2.4, 0.15), [material]));

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

const lightDirection = createVector3(-1, 0, -1);
normalizeVector3(lightDirection, lightDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.03 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: lightDirection, intensity: 2.5 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const y = Math.floor(bitmap.height / 2);
  const left = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * 0.43), y);
  const right = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * 0.57), y);
  if (left <= right + 25) {
    throw new Error(`[shading-normal-map] tangent-space halves did not separate (left ${left}, right ${right})`);
  }
}
