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
  createBoxMeshGeometry,
  createMesh,
  createPerspectiveProjection,
  createVector3,
  createWireframeMaterial,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  normalizeVector3,
  prepareScene3DRender,
  registerGlWireframeMaterial,
  renderGlBackground,
  setCamera3DJitter,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 dark field (0x0a0c10) with a white (0xffffff) wireframe cube centered at (0.5*W, 0.5*H) = (400, 300). The cube uses a deliberate one-point perspective pose, not an arbitrary rotation: the camera is 2.5 units from a unit cube and its 480 px focal length projects the near face to a 240×240 square and the far face to a separate 160×160 square. Their corresponding corners join on four depth edges, so all 12 outer edges remain distinguishable instead of collapsing into one straight-on square. Every outer corner and edge midpoint lands on an integer pixel coordinate before a controlled 1/2-pixel horizontal and 9/20-pixel vertical projection phase. Only thin triangle edges are visible against the dark background — no filled faces or shading gradient; the six face diagonals are visible because the cube faces are triangulated. Frame corners are dark background.',
);

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
});
registerGlWireframeMaterial(state);

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

// material-wireframe — proves a WireframeMaterial mesh renders only its triangle EDGES as lines on the
// Gl and Wgpu forward renderers, independent of scene lighting. A single cube sits at the origin;
// WireframeMaterial ignores lighting and draws each triangle's edges as 1px lines in a solid color,
// leaving the triangle interiors empty (background). The result is a mesh of bright lines over the dark
// background — NOT solid filled faces.
//
// thickness > 1 is unsupported (the backends draw 1px lines), so the wireframe reads as thin bright
// strokes separated by dark interior pixels.
//
// The signature the assertion checks: every one of the 12 outer-edge midpoints has a bright line nearby,
// while the projected cube bounds still contain dark interior samples. A solid fill would remove the dark
// samples; a blank surface or collapsed edge would miss a midpoint.
//
// app.ts is backend-agnostic: it builds the scene/camera/lights once and hands them to render(), whose
// per-backend implementation lives in render.webgl.ts / render.webgpu.ts.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const geometry = createBoxMeshGeometry(1, 1, 1);

// White edges, 1px thick (thickness > 1 is unsupported; the backends draw 1px lines). Lighting-independent.
const material = createWireframeMaterial({ color: 0xffffffff });

const scene = createScene3D().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// The one-point perspective is derived for the pixel lattice. A 480 px focal length with the camera at
// z=2.5 projects the near z=+0.5 face to half-size 120 px and the far z=-0.5 face to half-size 80 px.
// The nested squares are distinct, their four depth edges have slopes ±5 and ±1/5, and all outer
// endpoints are integers before the shared controlled subpixel phase.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({
    aspect: logicalWidth / logicalHeight,
    fovY: 2 * Math.atan(5 / 8),
  }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 2.5), createVector3(0, 0, 0), createVector3(0, 1, 0));
// Shift the integer lattice by exactly 1/2 screen pixel in x and 9/20 screen pixel in y. The slightly
// asymmetric rational phase keeps line endpoint ownership identical between Gl and Wgpu.
setCamera3DJitter(camera, 1 / logicalWidth, -9 / (10 * logicalHeight));

// The same directional + ambient rig as material-standard-pbr. WireframeMaterial ignores both — they are
// passed through unused so the scaffold matches the lit materials.
const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({
    color: 0xffffffff,
    direction: directionalDirection,
    intensity: 3,
  }),
});

render(scene, camera, lights);

// Assertion: all 12 cube edges render as separate projected segments, remain neutral white, and leave dark
// interiors. MEASURED defeat: a red wire keeps all twelve midpoint luminances above the old threshold and
// preserves its dark coverage, but the direct edge-0 color check fails as #ff0000 on this backend.
export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  let edgeIndex = 0;
  for (const varyingAxis of [0, 1, 2]) {
    for (const firstSign of [-1, 1]) {
      for (const secondSign of [-1, 1]) {
        const point: [number, number, number] = [0, 0, 0];
        point[(varyingAxis + 1) % 3] = firstSign * 0.5;
        point[(varyingAxis + 2) % 3] = secondSign * 0.5;
        const distance = 2.5 - point[2];
        const expectedX = Math.round(cx + (480 * point[0]) / distance);
        const expectedY = Math.round(cy - (480 * point[1]) / distance);
        const sample = findBrightestPixel(bitmap, expectedX, expectedY, 2);
        if (sample.luminance <= 40) {
          throw new Error(
            `[material-wireframe] edge ${edgeIndex} has no bright pixel near its projected midpoint ` +
              `(${expectedX}, ${expectedY})`,
          );
        }
        const red = (sample.rgb >> 16) & 255;
        const green = (sample.rgb >> 8) & 255;
        const blue = sample.rgb & 255;
        if (Math.min(red, green, blue) < 200 || Math.max(red, green, blue) - Math.min(red, green, blue) > 24) {
          throw new Error(
            `[material-wireframe] edge ${edgeIndex} near (${expectedX}, ${expectedY}) is ` +
              `#${sample.rgb.toString(16).padStart(6, '0')} — expected a neutral white wire`,
          );
        }
        edgeIndex++;
      }
    }
  }

  let darkCount = 0;
  for (let y = cy - 108; y <= cy + 108; y += 12) {
    for (let x = cx - 108; x <= cx + 108; x += 12) {
      if (getBitmapPixelLuminance(bitmap, x, y) <= 20) darkCount++;
    }
  }
  if (darkCount === 0) {
    throw new Error(
      '[material-wireframe] no dark samples inside the projected cube bounds — bitmap appears solid-filled',
    );
  }
}

function findBrightestPixel(
  bitmap: Readonly<Bitmap>,
  cx: number,
  cy: number,
  radius: number,
): { readonly luminance: number; readonly rgb: number } {
  let luminance = -1;
  let rgb = 0;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const candidateLuminance = getBitmapPixelLuminance(bitmap, x, y);
      if (candidateLuminance <= luminance) continue;
      luminance = candidateLuminance;
      rgb = getBitmapPixelRgb(bitmap, x, y);
    }
  }
  return { luminance, rgb };
}

// Barrel so TypeScript resolves the `./render` import in app.ts; the functional harness routes it to the
// active backend's render.<renderer>.ts at runtime.
