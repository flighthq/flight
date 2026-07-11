import { createScene } from '@flighthq/scene';
import { drawGlScene } from '@flighthq/scene-gl';
import type { Camera, GlRenderEffectPipeline, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createBlinnPhongMaterial,
  createCamera,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createHemisphereLight,
  createMesh,
  createPerspectiveProjection,
  createSceneLights,
  createSphereMeshGeometry,
  createVector3,
  endGlRenderEffectPipeline,
  getSurfacePixelLuminance,
  prepareSceneRender,
  registerBlinnPhongGlMaterial,
  renderGlBackground,
  setCameraViewMatrix4FromLookAt,
} from '@flighthq/sdk';

// drawGlScene collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu) — import the Gl one directly.

// light-hemisphere — proves a HEMISPHERE light shades the forward Gl mesh pass. A mid-gray sphere at
// the origin is lit by one hemisphere light with a BRIGHT sky (up, +y) and a DARK ground (down, -y).
// Hemisphere shading blends sky↔ground by the surface normal's up-facing-ness (0.5 + 0.5·N·up), so the
// top of the sphere (normals point up → sky) is bright and the bottom (normals point down → ground) is
// dark. The oracle samples a point above center and below center and asserts the top is clearly
// brighter — the sky/ground gradient signature of hemisphere lighting, absent before it was wired in.
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

// A single hemisphere light: bright warm-white sky, near-black ground. Top-facing surfaces read sky,
// bottom-facing read ground, so the sphere carries a top-bright / bottom-dark vertical gradient.
const lights = createSceneLights({
  hemisphere: [createHemisphereLight({ groundColor: 0x101014ff, intensity: 3, skyColor: 0xfff0e0ff })],
});

render(scene, camera, lights);

// Oracle: not blank + shows the sky/ground gradient. Sample above and below center (both inset so they
// land on the sphere); the top (sky) must be clearly brighter than the bottom (ground).
export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  const offset = Math.floor(surface.height * 0.1);

  const skyLuminance = getSurfacePixelLuminance(surface, cx, cy - offset);
  const groundLuminance = getSurfacePixelLuminance(surface, cx, cy + offset);

  if (skyLuminance <= 24) {
    throw new Error(`[light-hemisphere] top is blank (luminance ${skyLuminance}) — hemisphere light did not shade`);
  }
  if (skyLuminance <= groundLuminance + 24) {
    throw new Error(
      `[light-hemisphere] no sky/ground gradient: top (${skyLuminance}) is not clearly brighter than bottom (${groundLuminance})`,
    );
  }
}
