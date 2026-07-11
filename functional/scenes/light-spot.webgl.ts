import { createScene } from '@flighthq/scene';
import { drawGlScene } from '@flighthq/scene-gl';
import type { Camera, GlRenderEffectPipeline, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createPerspectiveProjection,
  createSceneLights,
  createSpotLight,
  createSphereMeshGeometry,
  createVector3,
  endGlRenderEffectPipeline,
  getSurfacePixelLuminance,
  normalizeVector3,
  prepareSceneRender,
  registerBlinnPhongGlMaterial,
  renderGlBackground,
  setCameraViewMatrix4FromLookAt,
} from '@flighthq/sdk';

// drawGlScene collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu) — import the Gl one directly.

// light-spot — proves a SPOT light shades the forward Gl mesh pass. A mid-gray sphere at the origin is
// lit by one white spot placed up-front-right, aimed at the origin with a moderate cone. A spot is a
// point light restricted to a cone, so it lights only the cap of the sphere inside the cone (the
// screen-right hemisphere here); the opposite side is both facing away AND outside the cone, so it
// falls to the dim ambient fill. The oracle asserts the in-cone side is clearly brighter than the
// out-of-cone side — the signature of the cone-limited punctual shading wired into the forward pass.
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

export function render(scene: Readonly<SceneNode>, camera: Readonly<Camera>, lights: Readonly<SceneLights>): void {
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

const scene = createScene();
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

// A white spot up-front-right, aimed back at the origin with a 24° outer cone (12° inner hotspot), plus
// a dim ambient fill. The cone covers the screen-right cap of the sphere; the screen-left side sits
// outside the cone and unlit.
const spotPosition = createVector3(1.3, 0.5, 1.6);
const spotDirection = createVector3(-1.3, -0.5, -1.6);
normalizeVector3(spotDirection, spotDirection);
const lights = createSceneLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  spot: [
    createSpotLight({
      color: 0xffffffff,
      direction: spotDirection,
      innerConeDegrees: 12,
      intensity: 6,
      outerConeDegrees: 24,
      position: spotPosition,
      range: -1,
    }),
  ],
});

render(scene, camera, lights);

// Oracle: not blank + shows cone-limited shading. The cone covers the +x cap, so the screen-right
// point is inside the cone (bright) and the screen-left point is outside it (shadowed).
export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  const offset = Math.floor(surface.width * 0.075);

  const inConeLuminance = getSurfacePixelLuminance(surface, cx + offset, cy);
  const outConeLuminance = getSurfacePixelLuminance(surface, cx - offset, cy);

  if (inConeLuminance <= 24) {
    throw new Error(`[light-spot] in-cone side is blank (luminance ${inConeLuminance}) — spot light did not shade`);
  }
  if (inConeLuminance <= outConeLuminance + 24) {
    throw new Error(
      `[light-spot] no cone shading: in-cone side (${inConeLuminance}) is not clearly brighter than out-of-cone side (${outConeLuminance})`,
    );
  }
}
