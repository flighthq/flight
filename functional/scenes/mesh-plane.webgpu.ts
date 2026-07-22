import { createScene } from '@flighthq/scene';
import { drawWgpuScene } from '@flighthq/scene-wgpu';
import type { Camera3D, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createPerspectiveProjection,
  createPlaneMeshGeometry,
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

// mesh-plane — proves the flat PLANE geometry builder (createPlaneMeshGeometry) projects and
// rasterizes a filled quad on the Gl and Wgpu scene renderers, independent of shading. The plane
// lies in the XZ plane with its single up-facing (+Y) normal, so it is INVISIBLE edge-on; the
// camera is therefore placed above and in front (eye at (0, 2.2, 2.6)) looking down at the origin,
// so the +Y front face reads as a filled parallelogram covering the frame center. The plane winds
// CCW when viewed from +Y, so this above-front view sees the front face; if the scene renderer
// back-face culls, a from-below view would vanish — viewing from above is the correct front-facing
// orientation. An UnlitMaterial (flat color, lighting-independent) keeps the test about geometry,
// not shading: where the quad's two triangles land on screen.
//
// app.ts is backend-agnostic; the per-backend scene wiring (effect pipeline, depth, unlit material
// registration) lives in render.webgl.ts / render.webgpu.ts (copied from material-unlit).

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A 2.5 x 2.5 flat plane at the origin, flat-teal and unlit so the test reads geometry, not lighting.
const geometry = createPlaneMeshGeometry(2.5, 2.5);
const material = createUnlitMaterial({ baseColor: 0x30c0b0ff });

const scene = createScene().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// Above-and-in-front so the +Y front face reads as a filled tilted quad (a parallelogram), not an
// edge-on sliver. A plane viewed edge-on vanishes; this elevated 3/4 view fills the center.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 2.2, 2.6), createVector3(0, 0, 0), createVector3(0, 1, 0));

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

  // 1) The tilted plane covers the frame center with its flat teal surface (the front face rasterized
  //    where the projection places it). If this is background, the plane is single-sided/back-facing
  //    from above or failed to build — flip the camera below the plane or check winding.
  const center = getSurfacePixelRgb(surface, cx, cy);
  if (!isTeal(center)) {
    throw new Error(
      `[mesh-plane] plane center not the unlit teal — got #${hex(center)} (plane missing, mis-projected, or back-facing from above)`,
    );
  }

  // 2) A small ring around center is also on the plane (a filled quad, not a sliver/edge-on line).
  const r = Math.floor(surface.width * 0.05);
  for (const [dx, dy] of [
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ]) {
    if (getSurfacePixelLuminance(surface, cx + dx, cy + dy) <= 30) {
      throw new Error(
        `[mesh-plane] plane does not fill around center at (${dx},${dy}) — quad too small/offset/edge-on`,
      );
    }
  }

  // 3) The four frame corners are background (the tilted plane is bounded, not filling the whole
  //    frame) — proving a real projected quad rather than a full-screen clear or fallback.
  const m = Math.floor(surface.width * 0.04);
  for (const [x, y] of [
    [m, m],
    [surface.width - m, m],
    [m, surface.height - m],
    [surface.width - m, surface.height - m],
  ]) {
    if (getSurfacePixelLuminance(surface, x, y) > 40) {
      throw new Error(`[mesh-plane] frame corner (${x},${y}) not background — plane silhouette is not bounded`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isTeal(rgb: number): boolean {
  // 0x30c0b0: low red, strong green, strong blue — green and blue dominate red.
  return channel(rgb, 8) > 120 && channel(rgb, 0) > 90 && channel(rgb, 8) > channel(rgb, 16) + 50;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
