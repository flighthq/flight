import { createScene } from '@flighthq/scene';
import { drawWgpuScene } from '@flighthq/scene-wgpu';
import type { Camera3D, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
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
  getSurfacePixelChannel,
  ImageChannel,
  normalizeVector3,
  prepareSceneRender,
  registerStandardPbrWgpuMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// drawWgpuScene collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu both export it), so import
// the Wgpu one directly from its package.

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x002850ff });
registerStandardPbrWgpuMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<SceneNode>, camera: Readonly<Camera3D>, lights: Readonly<SceneLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  prepareSceneRender(state, scene, camera, lights);
  drawWgpuScene(state, scene, camera, lights);
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

const material = createStandardPbrMaterial({
  alphaMap: createTexture({ colorSpace: 'linear', image: createImageResourceFromCanvas(alphaGradientCanvas()) }),
  alphaMode: 'blend',
  baseColor: 0xcc5522ff,
  metallic: 0,
  roughness: 1,
});

const scene = createScene().root;
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
const lights = {
  ambient: createAmbientLight({ color: 0x404040ff, intensity: 0.3 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1.4 }),
};

render(scene, camera, lights);

// Oracle: red decreases strictly left → middle → right as the alpha gradient blends more of the cool
// background over the warm PBR quad. Strictly-monotonic (not just left>right) proves the middle is a
// genuine partial BLEND, not a mask's binary cut, and that the PBR path sampled the alpha map at all.
export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  const offset = Math.floor(surface.width * 0.3);

  const leftRed = getSurfacePixelChannel(surface, cx - offset, cy, ImageChannel.Red);
  const middleRed = getSurfacePixelChannel(surface, cx, cy, ImageChannel.Red);
  const rightRed = getSurfacePixelChannel(surface, cx + offset, cy, ImageChannel.Red);

  if (leftRed <= 40) {
    throw new Error(`[material-alpha-map-pbr] opaque (left) edge did not render the PBR quad (red ${leftRed})`);
  }
  if (!(leftRed > middleRed + 12 && middleRed > rightRed + 12)) {
    throw new Error(
      `[material-alpha-map-pbr] alpha gradient did not blend monotonically: left ${leftRed}, middle ${middleRed}, right ${rightRed}`,
    );
  }
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
