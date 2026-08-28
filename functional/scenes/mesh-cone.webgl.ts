import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createConeMeshGeometry,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createLambertMaterial,
  createMesh,
  createPerspectiveProjection,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  normalizeVector3,
  prepareScene3DRender,
  registerGlLambertMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 dark field (0x0a0c10) with a Lambert-lit amber (0xf0a020) cone viewed from below its base. The camera at (1.4,-1.8,2.6) aims at the bottom-cap centre (0,-0.7,0), so that cap is the nearest surface and covers frame centre (0.5*W,0.5*H) = (400,300). The flat cap is bright amber under a directional light from below, while the visible tapering side behind it is darker. Frame corners are background.',
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
registerGlLambertMaterial(state);

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

// mesh-cone — proves the cone's bottom cap faces outward on the Gl and Wgpu scene renderers. A cone
// of radius 0.7 and height 1.4 sits at the origin with its apex at +Y and base at -Y (spanning Y
// -0.7..+0.7). The camera is below the base and aims at the cap centre, so the cap is the nearest
// surface on the frame-centre ray. Back-face culling therefore makes its winding directly observable.
//
// Lambert shading makes the flat -Y cap a distinct bright amber surface under a light from below,
// while the visible tapering side behind it is darker. The oracle samples the cap's own colour, not
// the silhouette: a reversed bottom-cap fan is culled and exposes background at the same pixel.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A matte amber cone. Lambert shading distinguishes the flat cap normal from the tapering side.
const geometry = createConeMeshGeometry(0.7, 1.4);
const material = createLambertMaterial({ diffuse: 0xf0a020ff });

const scene = createScene3D().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// Aim directly at the bottom-cap centre from below its Y plane. The frame-centre ray reaches the cap
// before entering the cone, so no side triangle can replace the sample if the cap is culled.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(
  camera,
  createVector3(1.4, -1.8, 2.6),
  createVector3(0, -0.7, 0),
  createVector3(0, 1, 0),
);

// Direction is light travel, so a positive Y component illuminates the cap's -Y normal. Keeping X
// and Z non-zero prevents an axis-aligned light from hiding a convention error on the visible side.
const directionalDirection = createVector3(0.25, 1, 0.35);
normalizeVector3(directionalDirection, directionalDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.18 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1.5 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);

  // The aimed-at frame-centre pixel belongs to the nearest bottom cap. Require the cap's amber
  // chroma, rather than mere silhouette coverage, so background or a differently shaded surface fails.
  const center = getBitmapPixelRgb(bitmap, cx, cy);
  if (!isLitAmber(center)) {
    throw new Error(
      `[mesh-cone] bottom-cap centre is not lit amber — got #${hex(center)} (cap culled or mis-projected)`,
    );
  }

  // This frame-interior point is on the tapering side behind the cap. The correct captures are
  // byte-identical across Gl/Wgpu: cap #ffbb28, side #251a03. Requiring the side's dark amber chroma
  // proves the sample did not fall onto background; the conservative luminance gap proves Lambert
  // shading distinguishes the flat cap from the side (an unlit material would make them uniform).
  const sideY = cy - Math.floor(bitmap.height * 0.25);
  const side = getBitmapPixelRgb(bitmap, cx, sideY);
  if (!isDarkAmber(side)) {
    throw new Error(
      `[mesh-cone] taper-side probe is not dark amber — got #${hex(side)} (side missing or mis-projected)`,
    );
  }
  const capLuminance = getBitmapPixelLuminance(bitmap, cx, cy);
  const sideLuminance = getBitmapPixelLuminance(bitmap, cx, sideY);
  if (capLuminance <= sideLuminance + 80) {
    throw new Error(
      `[mesh-cone] bottom cap is not distinctly lit above the side — cap ${capLuminance}, side ${sideLuminance}`,
    );
  }

  // The four frame corners remain background (a bounded surface, not a full-screen clear).
  const m = Math.floor(bitmap.width * 0.04);
  for (const [x, y] of [
    [m, m],
    [bitmap.width - m, m],
    [m, bitmap.height - m],
    [bitmap.width - m, bitmap.height - m],
  ]) {
    if (getBitmapPixelLuminance(bitmap, x, y) > 40) {
      throw new Error(`[mesh-cone] frame corner (${x},${y}) not background — cone silhouette is not bounded`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isLitAmber(rgb: number): boolean {
  // Lambert/tone presentation may move absolute levels, but the cap retains red > green > blue.
  const red = channel(rgb, 16);
  const green = channel(rgb, 8);
  const blue = channel(rgb, 0);
  return red > 120 && green > 45 && red > green + 30 && green > blue + 20;
}
function isDarkAmber(rgb: number): boolean {
  const red = channel(rgb, 16);
  const green = channel(rgb, 8);
  const blue = channel(rgb, 0);
  return red > 20 && red > green && green > blue + 10;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
