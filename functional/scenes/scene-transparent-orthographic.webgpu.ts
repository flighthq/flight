import { createWebWgpuCanvasElement } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Bitmap, Camera3D, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createOrthographicProjection,
  createScene3DLights,
  createUnlitMaterial,
  createVector3,
  createWgpuAcquisition,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
  prepareScene3DRender,
  scene3DWgpuPipeline,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field, two aligned half-transparent square boxes overlap at the centre. ' +
    'The farther blue layer remains visible through the nearer red layer, producing one red-dominant ' +
    'purple rectangle with red at least visibly stronger than blue and almost no green. Both colours ' +
    'are present throughout the shared centre; the result is not pure red, pure blue or two ' +
    'side-by-side boxes. The area outside the bounded overlap remains near-black.',
);

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
const screenClear = { color: [0x0a / 0xff, 0x0c / 0xff, 0x10 / 0xff, 1], depth: 1.0 } as const;

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline, screenClear, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(scenePass, scene, camera, lights);
  endWgpuRenderEffectPipeline(scenePass, pipeline, []);
  endWgpuRenderPass(pass);
}

registerWgpuFunctionalTarget(state, screen, scale);

// Two overlapping transparent boxes exercise the GL scene renderer's projected-depth sort under an
// orthographic camera. They are authored in the deliberately wrong order: near red before far blue.
// Orthographic clip-W is constant, so sorting by clip-W leaves this scene order intact. Depending on
// depth-write policy, that either loses far blue or composites it last; both results are wrong. Sorting
// by projected clip-Z/W draws far blue first and near red last, so both channels remain and red dominates.
const scene = createScene3D().root;
const geometry = createBoxMeshGeometry(2.4, 2.4, 0.08);

const nearRed = createUnlitMaterial({ baseColor: 0xff000080 });
nearRed.alphaMode = 'blend';
const nearMesh = createMesh(geometry, [nearRed]);
nearMesh.position.z = 0.6;
invalidateNodeLocalTransform(nearMesh);
addNodeChild(scene, nearMesh);

const farBlue = createUnlitMaterial({ baseColor: 0x0000ff80 });
farBlue.alphaMode = 'blend';
const farMesh = createMesh(geometry, [farBlue]);
farMesh.position.z = 0.3;
invalidateNodeLocalTransform(farMesh);
addNodeChild(scene, farMesh);

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
  const rgb = getBitmapPixelRgb(bitmap, Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2));
  const red = (rgb >> 16) & 0xff;
  const green = (rgb >> 8) & 0xff;
  const blue = rgb & 0xff;

  if (red < 40 || blue < 20) {
    throw new Error(
      `[scene-transparent-orthographic] expected both transparent layers at center, got rgb(${red}, ${green}, ${blue})`,
    );
  }
  if (red <= blue + 20) {
    throw new Error(
      `[scene-transparent-orthographic] near red did not composite last over far blue, got rgb(${red}, ${green}, ${blue})`,
    );
  }
}
