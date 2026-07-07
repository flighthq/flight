import { createScene } from '@flighthq/scene';
import { drawWgpuScene } from '@flighthq/scene-wgpu';
import type { Camera, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createCamera,
  createConeMeshGeometry,
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
  setCameraViewMatrix4FromLookAt,
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

export function render(scene: Readonly<SceneNode>, camera: Readonly<Camera>, lights: Readonly<SceneLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  prepareSceneRender(state, scene, camera, lights);
  drawWgpuScene(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// mesh-cone — proves the CONE geometry builder (createConeMeshGeometry) projects and rasterizes a
// tapered solid on the Gl and Wgpu scene renderers, independent of shading. A cone of radius 0.7 and
// height 1.4 sits at the origin with its apex at +Y and base at -Y (spanning Y -0.7..+0.7). Viewed
// from a slight side angle (eye at (1.4, 0.8, 2.6)) it reads as a triangle-ish silhouette: wide at
// the base, narrowing to a point at the top. An UnlitMaterial (flat color, lighting-independent)
// keeps the test about geometry, not shading — where the cone's side and cap triangles land.
//
// Beyond the standard center-covered / corners-background silhouette, this adds a TAPER check: a
// point low and near center (over the wide base → color) is on the cone, while a point high and off
// to the side (where the cone has narrowed toward its apex → background) is NOT. That asymmetry is
// the geometric signature of a cone vs. a box or cylinder. The taper offsets are kept lenient.
//
// app.ts is backend-agnostic; the per-backend scene wiring (effect pipeline, depth, unlit material
// registration) lives in render.webgl.ts / render.webgpu.ts (copied from material-unlit).

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A cone (base radius 0.7, height 1.4) at the origin, flat-amber and unlit so the test reads geometry.
const geometry = createConeMeshGeometry(0.7, 1.4);
const material = createUnlitMaterial({ baseColor: 0xf0a020ff });

const scene = createScene();
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// A slight side angle so the taper (wide base, pointed apex) reads as an asymmetric silhouette.
const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCameraViewMatrix4FromLookAt(camera, createVector3(1.4, 0.8, 2.6), createVector3(0, 0, 0), createVector3(0, 1, 0));

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

  // 1) The cone covers the frame center with its flat amber surface (geometry rasterized where the
  //    projection places it).
  const center = getSurfacePixelRgb(surface, cx, cy);
  if (!isAmber(center)) {
    throw new Error(
      `[mesh-cone] cone center not the unlit amber — got #${hex(center)} (cone missing or mis-projected)`,
    );
  }

  // 2) A small ring around center is also on the cone body (a solid, not a sliver).
  const r = Math.floor(surface.width * 0.05);
  for (const [dx, dy] of [
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ]) {
    if (getSurfacePixelLuminance(surface, cx + dx, cy + dy) <= 30) {
      throw new Error(`[mesh-cone] cone does not fill around center at (${dx},${dy}) — silhouette too small/offset`);
    }
  }

  // 3) Taper signature: low-and-near-center (over the wide base) is on the cone; high-and-off-to-the-
  //    side (above the narrowing apex) is background. Lenient offsets keep this robust to view shifts.
  const ty = Math.floor(surface.width * 0.12);
  // Low center — over the broad base → on the cone.
  if (getSurfacePixelLuminance(surface, cx, cy + ty) <= 30) {
    throw new Error(`[mesh-cone] low-center base sample is background — cone base not wide (taper check failed)`);
  }
  // High and off to the side — past the narrowed apex → background.
  const sideX = Math.floor(surface.width * 0.22);
  const topY = Math.floor(surface.width * 0.22);
  if (getSurfacePixelLuminance(surface, cx + sideX, cy - topY) > 40) {
    throw new Error(`[mesh-cone] high-side sample is covered — cone does not taper to a point (taper check failed)`);
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
      throw new Error(`[mesh-cone] frame corner (${x},${y}) not background — cone silhouette is not bounded`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isAmber(rgb: number): boolean {
  // 0xf0a020: strong red, mid green, low blue, red the dominant channel.
  return channel(rgb, 16) > 150 && channel(rgb, 16) > channel(rgb, 0) + 60 && channel(rgb, 8) > 40;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
