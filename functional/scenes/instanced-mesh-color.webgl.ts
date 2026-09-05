import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Bitmap, Camera3D, GlRenderEffectPipeline, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  addNodeChild,
  appendInstancedMeshInstance,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createInstancedMesh,
  createMatrix4,
  createPerspectiveProjection,
  createScene3DLights,
  createUnlitMaterial,
  createVector3,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  normalizeVector3,
  prepareScene3DRender,
  setCamera3DViewMatrix4FromLookAt,
  setInstancedMeshInstanceColor,
  translateMatrix4,
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlRenderEffectPipeline,
  createGlRenderState,
  endGlRenderEffectPipeline,
  registerGlUnlitMaterial,
  renderGlBackground,
  scene2dGlPipeline,
} from '@flighthq/sdk';
import { declareAntialiasingPolicy, declareExpectedImageDescription } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 dark field (0x0a0c10) with three unit cubes in a row from ONE InstancedMesh sharing a single WHITE unlit material, each carrying its own per-instance colour: red (0xe03030) on the left, green (0x30c040) in the middle, blue (0x3050e0) on the right. With the camera 6 units back and fovY = PI/4, scale s = (H/2)/(6*tan(PI/8)) ~= 121 px/unit, so each cube is ~121 px wide, centred at y = H/2 = 300 and x = W/2 - 2*s ~= 159, W/2 = 400 and W/2 + 2*s ~= 641. The three cubes differ in hue: a batch that ignored per-instance colour would render all three of them white.',
);

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, {
      contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
    }),
  ),
  scene2dGlPipeline,
  { pixelRatio, backgroundColor: 0x0a0c10ff },
);
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
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// instanced-mesh-color — per-instance colour. All three instances share ONE white unlit material, so every hue in
// the frame comes from setInstancedMeshInstanceColor; the material contributes no colour of its own.
// Unlit is deliberate: the cubes render their instance colour exactly, so the oracle can name the hue it
// expects rather than a lighting-dependent range.
//
// A backend that ignores the per-instance colour palette renders three WHITE cubes — still three cubes,
// still correctly placed, still passing any "is the batch drawn" check. Only comparing the hues catches it.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const geometry = createBoxMeshGeometry(1, 1, 1);
// White, so the instance colour is the whole of the visible colour.
const material = createUnlitMaterial({ baseColor: 0xffffffff });

const scene = createScene3D().root;
const batch = createInstancedMesh(geometry, [material], 4);
addNodeChild(scene, batch);

const INSTANCES = [
  { color: 0xe03030ff, x: -2 },
  { color: 0x30c040ff, x: 0 },
  { color: 0x3050e0ff, x: 2 },
] as const;

for (const instance of INSTANCES) {
  const matrix = createMatrix4();
  translateMatrix4(matrix, matrix, instance.x, 0, 0);
  // THE FEATURE UNDER TEST: the index append returns is the one the colour is set on.
  const index = appendInstancedMeshInstance(batch, matrix);
  setInstancedMeshInstanceColor(batch, index, instance.color);
}

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 6), createVector3(0, 0, 0), createVector3(0, 1, 0));

const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const w = bitmap.width;
  const h = bitmap.height;
  const s = h / 2 / (6 * Math.tan(Math.PI / 8));
  const y = Math.round(h / 2);
  const expected = [
    { hue: 'red', offset: -2 },
    { hue: 'green', offset: 0 },
    { hue: 'blue', offset: 2 },
  ] as const;

  for (const { hue, offset } of expected) {
    const x = Math.round(w / 2 + offset * s);
    const rgb = getBitmapPixelRgb(bitmap, x, y);
    const got = dominantHue(rgb);
    if (got !== hue) {
      throw new Error(
        `[instanced-mesh-color] the cube at x=${offset} is ${got} but should be ${hue} (#${hex(rgb)}) — per-instance colour was not applied`,
      );
    }
  }

  // The corners stay background, so the row is three bounded cubes.
  for (const [x, cy] of [
    [4, 4],
    [w - 5, h - 5],
  ] as const) {
    if (getBitmapPixelLuminance(bitmap, x, cy) > 40) {
      throw new Error(`[instanced-mesh-color] corner (${x}, ${cy}) is lit — the batch is not bounded`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}

// Names the dominant channel, which is what separates the three instance colours from each other AND
// from the material's white (where no channel dominates).
function dominantHue(rgb: number): string {
  const r = channel(rgb, 16);
  const g = channel(rgb, 8);
  const b = channel(rgb, 0);
  const margin = 40;
  if (r > g + margin && r > b + margin) return 'red';
  if (g > r + margin && g > b + margin) return 'green';
  if (b > r + margin && b > g + margin) return 'blue';
  return `neutral #${hex(rgb)}`;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
