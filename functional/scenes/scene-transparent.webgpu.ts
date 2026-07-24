import { createScene } from '@flighthq/scene';
import { drawWgpuScene } from '@flighthq/scene-wgpu';
import type { Camera3D, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createPerspectiveProjection,
  createUnlitMaterial,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
  prepareSceneRender,
  registerUnlitWgpuMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

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

// Three overlapping, shallow boxes prove the WebGPU scene renderer's two-pass transparency contract.
// Scene order is deliberately near-transparent, opaque, far-transparent: opaque must still render
// first, then transparent surfaces must render far-to-near with depth testing on and depth writes off.
// Correct composition at center is red-dominant (near red over far blue over opaque green); drawing
// transparent scene order instead would make blue dominant.
const scene = createScene().root;
const geometry = createBoxMeshGeometry(2.4, 2.4, 0.08);

const nearRed = createUnlitMaterial({ baseColor: 0xff000080 });
nearRed.alphaMode = 'blend';
const nearMesh = createMesh(geometry, [nearRed]);
nearMesh.position.z = 0.6;
invalidateNodeLocalTransform(nearMesh);
addNodeChild(scene, nearMesh);

const opaqueGreen = createUnlitMaterial({ baseColor: 0x00ff00ff });
const opaqueMesh = createMesh(geometry, [opaqueGreen]);
opaqueMesh.position.z = 0;
invalidateNodeLocalTransform(opaqueMesh);
addNodeChild(scene, opaqueMesh);

const farBlue = createUnlitMaterial({ baseColor: 0x0000ff80 });
farBlue.alphaMode = 'blend';
const farMesh = createMesh(geometry, [farBlue]);
farMesh.position.z = 0.3;
invalidateNodeLocalTransform(farMesh);
addNodeChild(scene, farMesh);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

const lights = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 1 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, 0, -1), intensity: 0 }),
};

render(scene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const rgb = getSurfacePixelRgb(surface, Math.floor(surface.width / 2), Math.floor(surface.height / 2));
  const red = (rgb >> 16) & 0xff;
  const green = (rgb >> 8) & 0xff;
  const blue = rgb & 0xff;

  if (red < 40 || green < 20 || blue < 20) {
    throw new Error(`[scene-transparent] expected all three layers at center, got rgb(${red}, ${green}, ${blue})`);
  }
  if (red <= blue + 20) {
    throw new Error(
      `[scene-transparent] near red did not composite last over far blue, got rgb(${red}, ${green}, ${blue})`,
    );
  }
}
