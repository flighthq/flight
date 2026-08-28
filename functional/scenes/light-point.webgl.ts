import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createPerspectiveProjection,
  createPointLight,
  createScene3DLights,
  createSphereMeshGeometry,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  prepareScene3DRender,
  registerGlBlinnPhongMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 field on a near-black background with a single grey sphere centred in it, about 245 px across — D ' +
    '= H*tan(asin(0.5/3))/tan(pi/8) = 0.408*H — centred at (0.5*W, 0.5*H) = (400,300). It is lit FROM ONE SIDE BY ' +
    'A NEARBY LAMP: the right of the sphere is clearly brighter than the left, with a smooth falloff between them ' +
    'and a small bright highlight on the lit side. A uniformly lit sphere, or one whose left side is the ' +
    'brighter, is the failure — the lit half must be measurably lighter than the shadowed half, not merely ' +
    'different. The background stays near-black and is not lit up by the lamp.',
);
// drawGlScene3D collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu) — import the Gl one directly.

// light-point — proves a POINT light shades the forward Gl mesh pass. A mid-gray sphere at the origin
// is lit by one white point light placed up-front-right of it (+x/+y/+z). A point light illuminates
// from a POSITION (not a parallel direction), so the hemisphere facing the light's position is bright
// and the far side falls to the dim ambient fill. The assertion samples a screen-right (lit) and
// screen-left (shadowed) point and asserts the lit side is clearly brighter — the signature of real
// per-pixel punctual shading, absent before point lights were wired into the forward pass.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
});
registerGlBlinnPhongMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
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

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const geometry = createSphereMeshGeometry(0.5, 48, 32);
const material = createBlinnPhongMaterial({ diffuse: 0x808080ff, specular: 0x808080ff, shininess: 32 });

const scene = createScene3D().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

// One white point light up-front-right of the sphere (world +x/+y/+z), plus a dim cool ambient fill so
// the far side is not pure black. range -1 = unbounded (no distance cutoff); intensity carries the
// inverse-square falloff at this ~1 unit distance.
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  point: [createPointLight({ color: 0xffffffff, intensity: 5, position: createVector3(1.2, 0.4, 1.2), range: -1 })],
});

render(scene, camera, lights);

// Assertion: not blank + shows point shading. The lit hemisphere faces the light at +x, so the
// screen-right point is bright and the screen-left point is shadowed.
export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  const offset = Math.floor(bitmap.width * 0.075);

  const litLuminance = getBitmapPixelLuminance(bitmap, cx + offset, cy);
  const shadowLuminance = getBitmapPixelLuminance(bitmap, cx - offset, cy);

  if (litLuminance <= 24) {
    throw new Error(`[light-point] lit side is blank (luminance ${litLuminance}) — point light did not shade the mesh`);
  }
  if (litLuminance <= shadowLuminance + 24) {
    throw new Error(
      `[light-point] no point shading: lit side (${litLuminance}) is not clearly brighter than shadow side (${shadowLuminance})`,
    );
  }
}
