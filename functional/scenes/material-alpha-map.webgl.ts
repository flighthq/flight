import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createImageResourceFromCanvas,
  createMesh,
  createPerspectiveProjection,
  createQuadMeshGeometry,
  createTexture,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelChannel,
  ImageChannel,
  normalizeVector3,
  prepareScene3DRender,
  registerGlBlinnPhongMaterial,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'An 800x600 frame filled edge to edge by a single camera-facing quad — 3.4 x 2.6 world units against a view ' +
    'that is 3.314 x 2.485 units across at the quad plane, so the quad overhangs every edge and no quad border is ' +
    'visible — split down the middle into two halves that differ ONLY IN COVERAGE. Left of x = 0.5*W = 400 px the ' +
    'quad is fully present and reads as a warm, evenly lit orange-red (diffuse 0xcc5522, specular black, so there ' +
    'is no highlight anywhere on it). Right of x = 400 px every fragment is discarded, because the alpha map is ' +
    'green = 0 there against alphaCutoff 0.5, and the deep blue background (0x002850) stands alone. The boundary ' +
    'is a HARD VERTICAL LINE at x = 400 px running the full height of the frame: mask mode snaps at the cutoff, ' +
    'so no gradient band straddles it. A quad uniformly solid across its width means the alpha map never reached ' +
    'the material; a quad cut away everywhere means it was applied to every fragment. The scene renders into an ' +
    'HDR rgba16f target and is tone-presented, so the absolute warmth of the left half is backend-dependent while ' +
    'the left-red / right-blue split and the position of the boundary are not.',
);
// drawGlScene3D exists on both scene-gl and scene-wgpu, so it collides in the @flighthq/sdk barrel —
// import the Gl one directly from its package.

// Gl column. The BlinnPhong renderer writes linear HDR into the effect pipeline's rgba16f + depth
// scene target, then end with an empty effect list to tone-present the HDR scene to the canvas.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x002850ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerStandardGlTextureResolvers(state);
registerGlBlinnPhongMaterial(state);

const pipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  beginGlRenderEffectPipeline(state, pipeline, 'linear');
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// material-alpha-map — proves a BlinnPhong material's dedicated alpha (opacity) map drives per-pixel
// coverage on the Gl and Wgpu forward renderers (scene-gl / scene-wgpu). A camera-facing warm-orange
// lit quad fills the view; its alpha map is opaque on the LEFT half (green = 1) and empty on the RIGHT
// half (green = 0). With `alphaMode: 'mask'` (cutoff 0.5) the right half's fragments are discarded, so
// the cool-blue background shows through exactly where the alpha map is zero — the signature of the
// alpha map sampling into coverage (a material with no alpha map would render a uniform, fully-opaque
// quad). The assertion compares the RED channel (warm quad vs cool background) so it is robust to each
// backend's HDR tone-mapping of absolute brightness.
//
// The alpha map's green channel is LINEAR data (colorSpace 'linear'), read raw and multiplied into
// alpha before the mask cutoff — the same path scene-gl and scene-wgpu take, so both backends match.
const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A camera-facing quad slightly larger than the view so both sample points land on it (the left one
// on the opaque half, the right one on the discarded half revealing the background).
const geometry = createQuadMeshGeometry(3.4, 2.6);

const material = createBlinnPhongMaterial({
  alphaCutoff: 0.5,
  alphaMap: createTexture({
    colorSpace: 'linear',
    dimension: '2d',
    source: createImageResourceFromCanvas(alphaSplitCanvas()),
  }),
  alphaMode: 'mask',
  diffuse: 0xcc5522ff,
  specular: 0x000000ff,
  shininess: 16,
});

const scene = createScene3D().root;
addNodeChild(scene, createMesh(geometry, [material]));

// Perspective camera dead-on the quad from +z, looking at the origin.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

// One white light travelling mostly into the screen (-z) so the +z-facing quad is evenly lit, plus a
// dim ambient fill. Even lighting keeps the opaque half a flat bright field so the cutout reads clearly.
const directionalDirection = createVector3(-0.15, -0.15, -1);
normalizeVector3(directionalDirection, directionalDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x404040ff, intensity: 0.3 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
});

render(scene, camera, lights);

// Assertion: the opaque (left) half shows the warm quad (high red) and the cut-out (right) half shows the
// cool background (near-zero red), proving the alpha map drove coverage rather than a uniform fill.
export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  const offset = Math.floor(bitmap.width * 0.25);

  const opaqueRed = getBitmapPixelChannel(bitmap, cx - offset, cy, ImageChannel.Red);
  const cutoutRed = getBitmapPixelChannel(bitmap, cx + offset, cy, ImageChannel.Red);

  if (opaqueRed <= 40) {
    throw new Error(`[material-alpha-map] opaque half did not render the quad (red ${opaqueRed})`);
  }
  if (opaqueRed <= cutoutRed + 40) {
    throw new Error(
      `[material-alpha-map] alpha map did not cut out coverage: opaque red (${opaqueRed}) is not clearly above the cut-out red (${cutoutRed})`,
    );
  }
}

// An 8×8 opacity map: the left half green = 255 (opaque, kept), the right half green = 0 (below the
// 0.5 mask cutoff, discarded). Only the green channel is read; alpha stays 255 so the map itself is a
// fully-opaque image whose GREEN encodes coverage.
function alphaSplitCanvas(): HTMLCanvasElement {
  const size = 8;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const opaque = x < size / 2;
      image.data[i + 0] = 0;
      image.data[i + 1] = opaque ? 255 : 0;
      image.data[i + 2] = 0;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
