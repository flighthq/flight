import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createImageResourceFromCanvas,
  createMesh,
  createPerspectiveProjection,
  createQuadMeshGeometry,
  createStandardPbrMaterial,
  createTexture,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelChannel,
  ImageChannel,
  normalizeVector3,
  prepareScene3DRender,
  registerStandardGlTextureResolvers,
  registerGlStandardPbrMaterial,
  renderGlBackground,
  setTextureUvScale,
  setCamera3DViewMatrix4FromLookAt,
  createGlContextFromCanvasElement,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 field filled edge to edge by a single camera-facing PBR quad over a deep blue background ' +
    '(0x002850) — 3.4 x 2.6 world units against a 3.314 x 2.485 unit view, so the quad overhangs every edge. Its ' +
    'colour is a flat warm orange (a 1x1 0xcc5522 base-colour source, so its uvScale of 3 repeats an unchanging ' +
    'pixel and produces no visible banding), and what varies is COVERAGE, horizontally: at the visible left edge ' +
    'the quad is very nearly opaque but NOT exactly so — coverage there is about 0.993, because that edge sits at ' +
    'u = 0.0381 of the alpha map, already past its first texel centre at 0.5/16 = 0.03125, so the linear filter ' +
    'has begun mixing toward the second texel. From there coverage falls off CONTINUOUSLY and reaches zero at x = ' +
    '0.3183*W = 254.6 px. Beyond that the quad is completely gone and the field is bare background. This is a ' +
    'ONE-THIRD-WIDTH FADE, not two halves and not a hard edge — alphaMode blend composites the intermediate ' +
    'coverages, so the left band is a smooth orange-into-blue ramp with no step in it, and the remaining ' +
    'two-thirds is flat background. The stop point is derivable, and its derivation must respect that the opacity ' +
    'source is SAMPLED rather than continuous: both PBR pipelines sample every map from one shared UV that the ' +
    'PRIMARY base-colour map transform has already scaled by 3, and the alpha map is a 16-texel gradient with ' +
    'wrapU clamp-to-edge, so its green coverage channel first reaches 0 at the LAST TEXEL CENTRE, u = 15.5/16 of ' +
    'the map — not at u = 1. That is 15.5/48 = 0.3229 of the way across the quad, world x = -1.7 + 3.4*15.5/48 = ' +
    '-0.6021, which projects to 0.5*W*(1 - 0.6021/1.6569) = 0.3183*W = 254.6 px. A quad that fades across the ' +
    'whole width means the alpha map was sampled with its own untransformed UV instead of the shared one; a quad ' +
    'with a hard middle boundary means the gradient was quantised into a mask. The scene renders into an HDR ' +
    'rgba16f target and is tone-presented, so absolute levels are backend-dependent while the fade extent and ' +
    'direction are not.',
);
// drawGlScene3D exists on both scene-gl and scene-wgpu, so it collides in the @flighthq/sdk barrel —
// import the Gl one directly from its package.

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextFromCanvasElement(canvas, {
    contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  }),
  {
    pixelRatio,
    backgroundColor: 0x002850ff,
  },
);
registerStandardGlTextureResolvers(state);
registerGlStandardPbrMaterial(state);

const pipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 1,
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

// material-alpha-map-pbr — proves the STANDARD-PBR shader path samples the alpha (opacity) map AND that
// `alphaMode: 'blend'` composites it (not just the BlinnPhong + 'mask' path the sibling scene covers).
// A camera-facing warm-orange PBR quad fills the view; its alpha map is a horizontal GRADIENT — green
// (coverage) fades from 1 at the left edge to 0 at the right. In blend mode the fragment alpha drives
// premultiplied (ONE, ONE_MINUS_SRC_ALPHA) compositing over the cool-blue background, so the quad is opaque at the left, ~half-blended
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
// its first span. If a backend incorrectly shares the primary sampler, the alpha gradient repeats and
// the middle/right samples reveal the quad. Per-map sampling leaves both at background.
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
