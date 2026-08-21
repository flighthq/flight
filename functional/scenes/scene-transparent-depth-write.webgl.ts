import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Bitmap, Camera3D, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMatrix4,
  createMesh,
  createOrthographicProjection,
  createQuadMeshGeometry,
  createScene3DLights,
  createUnlitMaterial,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene3DRender,
  registerGlUnlitMaterial,
  renderGlBackground,
  rotateMatrix4,
  setCamera3DViewMatrix4FromLookAt,
  setNodeLocalMatrix4,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field, two large half-transparent quads cross in depth over the central ' +
    'area: a blue layer is underneath and a red layer composites last. Across the left, centre and ' +
    'right portions of their overlap, both red and blue remain visible but red is clearly dominant, ' +
    'producing a consistent red-purple mixture with almost no green. No part of the right overlap ' +
    'turns pure blue, neither layer punches a depth-shaped hole in the other, and the bounded area ' +
    'outside the quads remains near-black.',
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

const pipeline = createGlRenderEffectPipeline(state, {
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

// The two translucent quads cross in depth while their origins retain a stable far-blue, near-red
// draw order. On the right, the far-origin blue quad is locally closer than red: if blue writes depth,
// the later red fragment is rejected and that half turns blue. With transparent depth writes disabled,
// both layers composite everywhere and red remains dominant because it is drawn last. Distinct material
// objects force a rebind between the two draws, covering the shared beginGlMeshDraw state seam.
const scene = createScene3D().root;
const geometry = createQuadMeshGeometry(3.2, 2.4);
const yAxis = createVector3(0, 1, 0);

const farBlue = createUnlitMaterial({ baseColor: 0x0000ff80 });
farBlue.alphaMode = 'blend';
const farMesh = createMesh(geometry, [farBlue]);
const farMatrix = createMatrix4();
rotateMatrix4(farMatrix, farMatrix, yAxis, -Math.PI / 5);
setNodeLocalMatrix4(farMesh, farMatrix);
addNodeChild(scene, farMesh);

const nearRed = createUnlitMaterial({ baseColor: 0xff000080 });
nearRed.alphaMode = 'blend';
const nearMesh = createMesh(geometry, [nearRed]);
const nearMatrix = createMatrix4();
rotateMatrix4(nearMatrix, nearMatrix, yAxis, Math.PI / 5);
nearMatrix.m[14] = 0.2;
setNodeLocalMatrix4(nearMesh, nearMatrix);
addNodeChild(scene, nearMesh);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 1.5, halfWidth: 2 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 1 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, 0, -1), intensity: 0 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cy = Math.floor(bitmap.height / 2);
  for (const x of [bitmap.width * 0.35, bitmap.width * 0.5, bitmap.width * 0.65]) {
    const rgb = getBitmapPixelRgb(bitmap, Math.floor(x), cy);
    const red = (rgb >> 16) & 0xff;
    const green = (rgb >> 8) & 0xff;
    const blue = rgb & 0xff;

    if (red < 40 || blue < 20 || green > 20) {
      throw new Error(
        `[scene-transparent-depth-write] expected both transparent layers at x=${Math.floor(x)}, got rgb(${red}, ${green}, ${blue})`,
      );
    }
    if (red <= blue + 20) {
      throw new Error(
        `[scene-transparent-depth-write] red did not composite after blue at x=${Math.floor(x)}, got rgb(${red}, ${green}, ${blue})`,
      );
    }
  }
}
