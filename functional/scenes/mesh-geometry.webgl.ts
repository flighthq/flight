import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createPerspectiveProjection,
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
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 dark field (0x0a0c10) with an unlit orange (0xff8030) unit cube at the origin viewed from a 3/4 angle. The cube reads as a convex hexagonal silhouette centered at (0.5*W, 0.5*H) = (400, 300), spanning roughly x 0.31*W–0.68*W ≈ 248–545, y 0.28*H–0.78*H ≈ 165–469. Three faces are visible (front, top, right side). No shading gradient — the material is unlit. Frame corners are background.',
);

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
});
registerGlUnlitMaterial(state);

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

// mesh-geometry — proves the 3D mesh GEOMETRY pipeline (vertex positions + index topology → view/
// projection transform → rasterization) on the Gl and Wgpu scene renderers, independent of shading. A
// unit BOX is rendered with an UnlitMaterial (flat color, lighting-independent) viewed from a 3/4 angle,
// so what the assertion checks is purely WHERE the geometry lands on screen: the cube projects to a compact
// convex silhouette centered in the frame, covering the middle while leaving the corners as background.
//
// This complements the material-* tests (which shade a sphere) by exercising a different primitive
// builder and asserting the projected footprint of its triangles — a mesh that failed to transform,
// index, or rasterize its vertices would not place a solid block at the center with empty corners.
//
// app.ts is backend-agnostic; the per-backend scene wiring (effect pipeline, depth, unlit material
// registration) lives in render.webgl.ts / render.webgpu.ts (copied from material-unlit).

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A unit cube at the origin, flat-orange and unlit so the test reads geometry, not lighting.
const geometry = createBoxMeshGeometry(1, 1, 1);
const material = createUnlitMaterial({ baseColor: 0xff8030ff });

const scene = createScene3D().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// A 3/4 view so the cube reads as a 3D solid (a convex hexagonal silhouette) rather than a flat square.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(2, 1.6, 2.6), createVector3(0, 0, 0), createVector3(0, 1, 0));

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

  // 1) The cube covers the frame center with its flat orange surface (geometry rasterized where the
  //    projection places it).
  const center = getBitmapPixelRgb(bitmap, cx, cy);
  if (!isOrange(center)) {
    throw new Error(
      `[mesh-geometry] cube center not the unlit orange — got #${hex(center)} (mesh missing or mis-projected)`,
    );
  }

  // 2) A small ring around center is also on the cube (a solid block, not a sliver).
  const r = Math.floor(bitmap.width * 0.05);
  for (const [dx, dy] of [
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ]) {
    if (getBitmapPixelLuminance(bitmap, cx + dx, cy + dy) <= 30) {
      throw new Error(
        `[mesh-geometry] cube does not fill around center at (${dx},${dy}) — silhouette too small/offset`,
      );
    }
  }

  // 3) The four frame corners are background (the cube is bounded, not filling the whole frame) — proving
  //    a real projected silhouette rather than a full-screen clear or fallback.
  const m = Math.floor(bitmap.width * 0.04);
  for (const [x, y] of [
    [m, m],
    [bitmap.width - m, m],
    [m, bitmap.height - m],
    [bitmap.width - m, bitmap.height - m],
  ]) {
    if (getBitmapPixelLuminance(bitmap, x, y) > 40) {
      throw new Error(`[mesh-geometry] frame corner (${x},${y}) not background — cube silhouette is not bounded`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isOrange(rgb: number): boolean {
  // 0xff8030: strong red, mid green, low blue, red the dominant channel.
  return channel(rgb, 16) > 150 && channel(rgb, 16) > channel(rgb, 0) + 60 && channel(rgb, 8) > 40;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
