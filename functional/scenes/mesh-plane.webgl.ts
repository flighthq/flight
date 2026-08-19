import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
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
  createMesh,
  createPerspectiveProjection,
  createPlaneMeshGeometry,
  createUnlitMaterial,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  normalizeVector3,
  prepareScene3DRender,
  registerGlUnlitMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'An 800×600 dark field (0x0a0c10) with an unlit teal (0x30c0b0) flat plane in the XZ plane viewed from above and in front. The front face reads as a filled tilted trapezoid: the top (far) edge runs x 0.24*W–0.76*W ≈ 192–608 at y 0.28*H ≈ 166 and the bottom (near) edge runs x 0.04*W–0.96*W ≈ 31–769 at y 0.90*H ≈ 539. No shading gradient — the material is unlit. Frame corners are background.',
);

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerGlUnlitMaterial(state);

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
  // renderGlBackground clears color; the depth attachment needs its own clear to the far plane (1.0)
  // or every fragment fails the LESS depth test against an uncleared (0) buffer and the scene is black.
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

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

const scene = createScene3D().root;
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
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);

  // 1) The tilted plane covers the frame center with its flat teal surface (the front face rasterized
  //    where the projection places it). If this is background, the plane is single-sided/back-facing
  //    from above or failed to build — flip the camera below the plane or check winding.
  const center = getBitmapPixelRgb(bitmap, cx, cy);
  if (!isTeal(center)) {
    throw new Error(
      `[mesh-plane] plane center not the unlit teal — got #${hex(center)} (plane missing, mis-projected, or back-facing from above)`,
    );
  }

  // 2) A small ring around center is also on the plane (a filled quad, not a sliver/edge-on line).
  const r = Math.floor(bitmap.width * 0.05);
  for (const [dx, dy] of [
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ]) {
    if (getBitmapPixelLuminance(bitmap, cx + dx, cy + dy) <= 30) {
      throw new Error(
        `[mesh-plane] plane does not fill around center at (${dx},${dy}) — quad too small/offset/edge-on`,
      );
    }
  }

  // 3) The four frame corners are background (the tilted plane is bounded, not filling the whole
  //    frame) — proving a real projected quad rather than a full-screen clear or fallback.
  const m = Math.floor(bitmap.width * 0.04);
  for (const [x, y] of [
    [m, m],
    [bitmap.width - m, m],
    [m, bitmap.height - m],
    [bitmap.width - m, bitmap.height - m],
  ]) {
    if (getBitmapPixelLuminance(bitmap, x, y) > 40) {
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
