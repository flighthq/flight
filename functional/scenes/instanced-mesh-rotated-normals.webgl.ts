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
  createLambertMaterial,
  createMatrix4,
  createPerspectiveProjection,
  createScene3DLights,
  createVector3,
  getBitmapPixelLuminance,
  normalizeVector3,
  prepareScene3DRender,
  rotateMatrix4,
  setCamera3DViewMatrix4FromLookAt,
  translateMatrix4,
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlRenderEffectPipeline,
  createGlRenderState,
  endGlRenderEffectPipeline,
  registerGlLambertMaterial,
  renderGlBackground,
  scene2dGlPipeline,
} from '@flighthq/sdk';
import { declareAntialiasingPolicy, declareExpectedImageDescription } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 dark field (0x0a0c10) with three grey Lambert-lit cubes in a row from ONE InstancedMesh, each turned a different amount about Y by its own instance matrix: 0, -30 and -60 degrees, left to right. One directional light comes from up and behind the camera, so each cube presents its camera-facing face at a different angle to it and those faces read at three clearly different brightnesses, getting DARKER left to right (luminance about 233, 198 and 112). The two turned cubes also show a bright right-hand side face (about 211 and 237) that has swung toward the light. With the camera 6 units back and fovY = PI/4, the cubes are centred at y = H/2 = 300 and x about 159, 400 and 641.',
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
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// instanced-mesh-rotated-normals — per-instance surface basis. Each instance is rotated about Y by its own matrix, so its
// NORMALS are rotated too and each cube lights according to the way it actually faces.
//
// A vertex stage that applies the instance matrix to the position but not to the normal renders three
// cubes that are geometrically rotated yet shade IDENTICALLY, as though all three were still in the
// batch's bind orientation. The silhouettes are nearly identical for a Y-rotated cube, so only the
// brightness distinguishes the two cases — which is what the oracle measures.
//
// Lambert is deliberate: a purely diffuse N-dot-L response makes face brightness a direct read of the
// normal, with no specular lobe or tone mapping in between.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const geometry = createBoxMeshGeometry(1, 1, 1);
const material = createLambertMaterial({ diffuse: 0xb0b0b0ff });

const scene = createScene3D().root;
const batch = createInstancedMesh(geometry, [material], 4);
addNodeChild(scene, batch);

// THE FEATURE UNDER TEST: each instance carries its own rotation, so each has its own surface basis.
const TURNS = [0, -Math.PI / 6, -Math.PI / 3] as const;
for (let i = 0; i < TURNS.length; i++) {
  const matrix = createMatrix4();
  translateMatrix4(matrix, matrix, (i - 1) * 2, 0, 0);
  rotateMatrix4(matrix, matrix, createVector3(0, 1, 0), TURNS[i]!);
  appendInstancedMeshInstance(batch, matrix);
}

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 6), createVector3(0, 0, 0), createVector3(0, 1, 0));

// Straight in from the left, so a cube's brightness tracks how far it has turned toward the light.
const directionalDirection = createVector3(-0.35, -0.15, -1);
normalizeVector3(directionalDirection, directionalDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x202028ff, intensity: 0.25 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 2 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const w = bitmap.width;
  const h = bitmap.height;
  const y = Math.round(h / 2);
  // The camera-facing face of each cube. Read off the captured frame: the turned cubes also expose a
  // bright side face, so sampling the cube centre would mix two surfaces with opposite trends.
  const samples = [0.156, 0.469, 0.749].map((fx) => getBitmapPixelLuminance(bitmap, Math.round(w * fx), y));

  // 1) All three cubes rendered and are lit.
  for (let i = 0; i < samples.length; i++) {
    if (samples[i]! < 40) {
      throw new Error(
        `[instanced-mesh-rotated-normals] cube ${i} is unlit (luminance ${samples[i]}) — the batch did not render`,
      );
    }
  }

  // 2) THE POINT: the three differ. A vertex stage that leaves the normals in bind orientation shades
  //    every instance identically however its matrix turned it, collapsing these three to one value.
  const spread = Math.max(...samples) - Math.min(...samples);
  if (spread < 40) {
    throw new Error(
      `[instanced-mesh-rotated-normals] the three rotated instances shade almost identically (luminances ${samples.join(', ')}, spread ${spread}) — the per-instance rotation was not applied to the normals`,
    );
  }

  // 3) Brightness falls left to right, the order the rotations away from the light predict. A spread
  //    check alone would accept any scrambling of the three.
  if (!(samples[0]! > samples[1]! && samples[1]! > samples[2]!)) {
    throw new Error(
      `[instanced-mesh-rotated-normals] brightness is not decreasing left to right (luminances ${samples.join(', ')}) — the instance basis reached the normals but not as the rotations describe`,
    );
  }
}
