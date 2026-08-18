import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createBlinnPhongMaterial,
  createCamera3D,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createHemisphereLight,
  createMesh,
  createPerspectiveProjection,
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
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'An 800x600 field on a near-black background with a single grey sphere centred in it, about 245 px across — D ' +
    '= H*tan(asin(0.5/3))/tan(pi/8) = 0.408*H — centred at (0.5*W, 0.5*H) = (400,300), lit FROM ABOVE AND BELOW ' +
    'BY DIFFERENT LIGHT: its upper half is warm and clearly brighter, its lower half is much darker and cooler, ' +
    'with a smooth gradient between the two rather than a hard line. The top-versus-bottom difference is the ' +
    'claim — a sphere lit evenly, or one brighter at the bottom, is the failure. There is no single hard-edged ' +
    'highlight of the kind a lamp makes; the shading is broad and soft. The background stays near-black.',
);
// drawGlScene3D collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu) — import the Gl one directly.

// light-hemisphere — proves a HEMISPHERE light shades the forward Gl mesh pass. A mid-gray sphere at
// the origin is lit by one hemisphere light with a BRIGHT sky (up, +y) and a DARK ground (down, -y).
// Hemisphere shading blends sky↔ground by the surface normal's up-facing-ness (0.5 + 0.5·N·up), so the
// top of the sphere (normals point up → sky) is bright and the bottom (normals point down → ground) is
// dark. The assertion samples a point above center and below center and checks the top is clearly
// brighter — the sky/ground gradient signature of hemisphere lighting, absent before it was wired in.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerGlBlinnPhongMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
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

// A single hemisphere light: bright warm-white sky, near-black ground. Top-facing surfaces read sky,
// bottom-facing read ground, so the sphere carries a top-bright / bottom-dark vertical gradient.
const lights = createScene3DLights({
  hemisphere: [createHemisphereLight({ groundColor: 0x101014ff, intensity: 3, skyColor: 0xfff0e0ff })],
});

render(scene, camera, lights);

// Assertion: not blank + shows the sky/ground gradient. Sample above and below center (both inset so they
// land on the sphere); the top (sky) must be clearly brighter than the bottom (ground).
export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  const offset = Math.floor(bitmap.height * 0.1);

  const skyLuminance = getBitmapPixelLuminance(bitmap, cx, cy - offset);
  const groundLuminance = getBitmapPixelLuminance(bitmap, cx, cy + offset);

  if (skyLuminance <= 24) {
    throw new Error(`[light-hemisphere] top is blank (luminance ${skyLuminance}) — hemisphere light did not shade`);
  }
  if (skyLuminance <= groundLuminance + 24) {
    throw new Error(
      `[light-hemisphere] no sky/ground gradient: top (${skyLuminance}) is not clearly brighter than bottom (${groundLuminance})`,
    );
  }
}
