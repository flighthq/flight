import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createImageResourceFromCanvas,
  createMesh,
  createPerspectiveProjection,
  createQuadMeshGeometry,
  createStandardPbrMaterial,
  createTexture,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelChannel,
  ImageChannel,
  normalizeVector3,
  prepareScene3DRender,
  registerWgpuStandardPbrMaterial,
  registerWgpuImageTextureResolver,
  renderWgpuBackground,
  setTextureUvScale,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'An 800x600 field on a deep blue background with a single flat quad centred in it, split into two ' +
    'halves that differ ONLY IN OPACITY. The left half is solidly present and reads strongly red; the ' +
    'right half is cut away by an alpha map so the deep blue background shows through it and almost no ' +
    'red remains. A quad solid across its whole width means the alpha map never reached the material; a ' +
    'quad cut away everywhere means it was applied to all of it. The boundary runs vertically down the ' +
    'middle of the quad.',
);
// drawWgpuScene3D collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu both export it), so import
// the Wgpu one directly from its package.

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x002850ff });
registerWgpuImageTextureResolver(state);
registerWgpuStandardPbrMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// material-alpha-map-pbr — proves the STANDARD-PBR shader path samples the alpha (opacity) map AND that
// `alphaMode: 'blend'` composites it (not just the BlinnPhong + 'mask' path the sibling scene covers).
// A camera-facing warm-orange PBR quad fills the view; its alpha map is a horizontal GRADIENT — green
// (coverage) fades from 1 at the left edge to 0 at the right. In blend mode the fragment alpha drives
// SRC_ALPHA compositing over the cool-blue background, so the quad is opaque at the left, ~half-blended
// in the middle, and fully transparent (background) at the right. The gradient's intermediate middle is
// what distinguishes BLEND from MASK (a mask cutoff would snap each column fully on or off), and the
// warm-quad-vs-cool-background RED channel is robust to each backend's HDR tone-mapping.
const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A camera-facing quad slightly larger than the view so all three sample points land on it.
const geometry = createQuadMeshGeometry(3.4, 2.6);

const baseColorMap = createTexture({
  dimension: '2d',
  source: createImageResourceFromCanvas(baseColorCanvas()),
});
baseColorMap.sampler.wrapU = 'repeat';
setTextureUvScale(baseColorMap, 3, 1);
const alphaMap = createTexture({
  colorSpace: 'linear',
  dimension: '2d',
  source: createImageResourceFromCanvas(alphaGradientCanvas()),
});
alphaMap.sampler.wrapU = 'clamp-to-edge';
const material = createStandardPbrMaterial({
  alphaMap,
  alphaMode: 'blend',
  baseColor: 0xffffffff,
  baseColorMap,
  metallic: 0,
  roughness: 1,
});

const scene = createScene3D().root;
addNodeChild(scene, createMesh(geometry, [material]));

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

// One white light travelling mostly into the screen (-z) so the +z-facing quad is evenly lit, plus a
// dim ambient fill.
const directionalDirection = createVector3(-0.15, -0.15, -1);
normalizeVector3(directionalDirection, directionalDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x404040ff, intensity: 0.3 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1.4 }),
});

render(scene, camera, lights);

// The primary base-color map repeats across 3 UV spans, while the non-primary alpha map clamps after
// its first span. If WGPU incorrectly shares the primary sampler, the alpha gradient repeats and the
// middle/right samples reveal the quad. Per-map sampling leaves both at background.
export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  const offset = Math.floor(bitmap.width * 0.3);

  const leftRed = getBitmapPixelChannel(bitmap, cx - offset, cy, ImageChannel.Red);
  const middleRed = getBitmapPixelChannel(bitmap, cx, cy, ImageChannel.Red);
  const rightRed = getBitmapPixelChannel(bitmap, cx + offset, cy, ImageChannel.Red);

  if (leftRed <= 15) {
    throw new Error(`[material-alpha-map-pbr] opaque (left) edge did not render the PBR quad (red ${leftRed})`);
  }
  if (!(leftRed > middleRed + 12 && Math.abs(middleRed - rightRed) < 8)) {
    throw new Error(
      `[material-alpha-map-pbr] non-primary alpha sampler did not clamp: left ${leftRed}, middle ${middleRed}, right ${rightRed}`,
    );
  }
}

function baseColorCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#cc5522';
  ctx.fillRect(0, 0, 1, 1);
  return canvas;
}

// A 16×1 opacity gradient: green (the sampled coverage channel) fades 255 → 0 left to right, so the
// blend fades the warm quad into the background across the width. Alpha stays 255 (the map image itself
// is opaque; its GREEN encodes coverage).
function alphaGradientCanvas(): HTMLCanvasElement {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, 1);
  for (let x = 0; x < size; x++) {
    const i = x * 4;
    image.data[i + 0] = 0;
    image.data[i + 1] = Math.round(255 * (1 - x / (size - 1)));
    image.data[i + 2] = 0;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
