import { createScene } from '@flighthq/scene';
import { drawWgpuScene } from '@flighthq/scene-wgpu';
import type { Camera3D, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createCylinderMeshGeometry,
  createDirectionalLight,
  createMesh,
  createPerspectiveProjection,
  createUnlitMaterial,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getSurfacePixelLuminance,
  getSurfacePixelRgb,
  normalizeVector3,
  prepareSceneRender,
  registerUnlitWgpuMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// drawWgpuScene collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu both export it), so import
// the Wgpu one directly from its package.

// Wgpu parity column for the same unlit cube as render.webgl.ts. Wgpu state init is async.
// renderWgpuBackground opens the command encoder + clears; the effect pipeline runs between
// begin/end (the Unlit renderer writes into the rgba16f scene target, depth-tested), and
// submitWgpuRenderPass flushes. Frame capture is enabled (the software adapter never presents the
// swapchain headless) so the verifier reads the frame back from the GPU.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerUnlitWgpuMaterial(state);

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

// mesh-cylinder — proves the CYLINDER geometry builder (createCylinderMeshGeometry) projects and
// rasterizes a tall solid of revolution on the Gl and Wgpu scene renderers, independent of shading.
// A cylinder with equal top/bottom radii 0.6 and height 1.4 sits at the origin, spanning Y
// -0.7..+0.7. Viewed from a slight side angle (eye at (1.6, 0.4, 2.6)) it reads as a vertically
// extended capsule/rectangle silhouette: tall body, straight sides, no taper. An UnlitMaterial
// (flat color, lighting-independent) keeps the test about geometry, not shading.
//
// Beyond the standard center-covered / corners-background silhouette, this adds a VERTICAL-EXTENT
// check: top-center and bottom-center of the body are both on the cylinder (color), confirming a
// tall body rather than a flat disc, while the left/right far frame corners stay background. Unlike
// the cone, both top and bottom are full-width — the absence of taper is the cylinder's signature.
//
// app.ts is backend-agnostic; the per-backend scene wiring (effect pipeline, depth, unlit material
// registration) lives in render.webgl.ts / render.webgpu.ts (copied from material-unlit).

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A cylinder (radius 0.6, height 1.4) at the origin, flat-violet and unlit so the test reads geometry.
const geometry = createCylinderMeshGeometry(0.6, 0.6, 1.4);
const material = createUnlitMaterial({ baseColor: 0x9050e0ff });

const scene = createScene().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// A slight side angle, eye held low so the tall body fills vertically rather than showing mostly the
// top cap — the vertical extent is what distinguishes a cylinder from a disc.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(1.6, 0.4, 2.6), createVector3(0, 0, 0), createVector3(0, 1, 0));

// Unlit ignores lights, but render() requires a valid rig.
const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = {
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
};

render(scene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);

  // 1) The cylinder covers the frame center with its flat violet surface (geometry rasterized where
  //    the projection places it).
  const center = getSurfacePixelRgb(surface, cx, cy);
  if (!isViolet(center)) {
    throw new Error(
      `[mesh-cylinder] cylinder center not the unlit violet — got #${hex(center)} (cylinder missing or mis-projected)`,
    );
  }

  // 2) A small ring around center is also on the cylinder body (a solid, not a sliver).
  const r = Math.floor(surface.width * 0.05);
  for (const [dx, dy] of [
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ]) {
    if (getSurfacePixelLuminance(surface, cx + dx, cy + dy) <= 30) {
      throw new Error(
        `[mesh-cylinder] cylinder does not fill around center at (${dx},${dy}) — silhouette too small/offset`,
      );
    }
  }

  // 3) Vertical-extent signature: top-center and bottom-center of the body are both on the cylinder,
  //    confirming a tall body (not a flat disc). Lenient offset keeps this robust to view shifts.
  const vy = Math.floor(surface.width * 0.14);
  if (getSurfacePixelLuminance(surface, cx, cy - vy) <= 30) {
    throw new Error(
      `[mesh-cylinder] top-center body sample is background — cylinder not tall (vertical-extent check failed)`,
    );
  }
  if (getSurfacePixelLuminance(surface, cx, cy + vy) <= 30) {
    throw new Error(
      `[mesh-cylinder] bottom-center body sample is background — cylinder not tall (vertical-extent check failed)`,
    );
  }

  // 4) The four frame corners are background (a bounded silhouette, not a full-screen clear).
  const m = Math.floor(surface.width * 0.04);
  for (const [x, y] of [
    [m, m],
    [surface.width - m, m],
    [m, surface.height - m],
    [surface.width - m, surface.height - m],
  ]) {
    if (getSurfacePixelLuminance(surface, x, y) > 40) {
      throw new Error(`[mesh-cylinder] frame corner (${x},${y}) not background — cylinder silhouette is not bounded`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isViolet(rgb: number): boolean {
  // 0x9050e0: strong blue, mid red, low-mid green — blue the dominant channel, red above green.
  return channel(rgb, 0) > 120 && channel(rgb, 0) > channel(rgb, 8) + 40 && channel(rgb, 0) > channel(rgb, 16);
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
