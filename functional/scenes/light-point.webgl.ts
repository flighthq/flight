import { createScene } from '@flighthq/scene';
import { drawGlScene } from '@flighthq/scene-gl';
import type { Camera3D, GlRenderEffectPipeline, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
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
  createSceneLights,
  createSphereMeshGeometry,
  createVector3,
  endGlRenderEffectPipeline,
  getSurfacePixelLuminance,
  prepareSceneRender,
  registerBlinnPhongGlMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';

// drawGlScene collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu) — import the Gl one directly.

// light-point — proves a POINT light shades the forward Gl mesh pass. A mid-gray sphere at the origin
// is lit by one white point light placed up-front-right of it (+x/+y/+z). A point light illuminates
// from a POSITION (not a parallel direction), so the hemisphere facing the light's position is bright
// and the far side falls to the dim ambient fill. The oracle samples a screen-right (lit) and
// screen-left (shadowed) point and asserts the lit side is clearly brighter — the signature of real
// per-pixel punctual shading, absent before point lights were wired into the forward pass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerBlinnPhongGlMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<SceneNode>, camera: Readonly<Camera3D>, lights: Readonly<SceneLights>): void {
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareSceneRender(state, scene, camera, lights);
  drawGlScene(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const geometry = createSphereMeshGeometry(0.5, 48, 32);
const material = createBlinnPhongMaterial({ diffuse: 0x808080ff, specular: 0x808080ff, shininess: 32 });

const scene = createScene().root;
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
const lights = createSceneLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  point: [createPointLight({ color: 0xffffffff, intensity: 5, position: createVector3(1.2, 0.4, 1.2), range: -1 })],
});

render(scene, camera, lights);

// Oracle: not blank + shows point shading. The lit hemisphere faces the light at +x, so the
// screen-right point is bright and the screen-left point is shadowed.
export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  const offset = Math.floor(surface.width * 0.075);

  const litLuminance = getSurfacePixelLuminance(surface, cx + offset, cy);
  const shadowLuminance = getSurfacePixelLuminance(surface, cx - offset, cy);

  if (litLuminance <= 24) {
    throw new Error(`[light-point] lit side is blank (luminance ${litLuminance}) — point light did not shade the mesh`);
  }
  if (litLuminance <= shadowLuminance + 24) {
    throw new Error(
      `[light-point] no point shading: lit side (${litLuminance}) is not clearly brighter than shadow side (${shadowLuminance})`,
    );
  }
}
