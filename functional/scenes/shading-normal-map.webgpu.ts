import { createScene } from '@flighthq/scene';
import { drawWgpuScene, registerBuiltInWgpuModifierSnippets, registerShadedWgpuMaterial } from '@flighthq/scene-wgpu';
import type { Camera3D, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDissolveModifier,
  createDirectionalLight,
  createEnvReflectModifier,
  createFogModifier,
  createImageResourceFromCanvas,
  createMesh,
  createPerspectiveProjection,
  createShadedMaterial,
  createTexture,
  createToonModifier,
  createVector3,
  createVertexDisplaceModifier,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getSurfacePixelLuminance,
  normalizeVector3,
  prepareSceneRender,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
  VertexDisplaceModifierSource,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x080b12ff,
});
registerShadedWgpuMaterial(state);
registerBuiltInWgpuModifierSnippets(state);

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
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  prepareSceneRender(state, scene, camera, lights);
  drawWgpuScene(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

const normalSource = document.createElement('canvas');
normalSource.width = 64;
normalSource.height = 64;
const normalContext = normalSource.getContext('2d')!;
normalContext.fillStyle = '#e080d0';
normalContext.fillRect(0, 0, 32, 64);
normalContext.fillStyle = '#2080d0';
normalContext.fillRect(32, 0, 32, 64);

const material = createShadedMaterial({
  diffuse: 0xb0c8e0ff,
  normalMap: createTexture({
    colorSpace: 'linear',
    image: createImageResourceFromCanvas(normalSource),
  }),
  normalScale: 1,
  modifiers: [
    createVertexDisplaceModifier({
      amplitude: 0,
      source: VertexDisplaceModifierSource.Sine,
    }),
    createDissolveModifier({ threshold: 0 }),
    createEnvReflectModifier({ intensity: 0 }),
    createFogModifier({ color: 0x000000ff, far: 1000 }),
    createToonModifier({ steps: 8, smoothness: 0.1 }),
  ],
  shininess: 12,
  specular: 0x202020ff,
});

const scene = createScene().root;
addNodeChild(scene, createMesh(createBoxMeshGeometry(2.4, 2.4, 0.15), [material]));

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

const lightDirection = createVector3(-1, 0, -1);
normalizeVector3(lightDirection, lightDirection);
const lights = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.03 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: lightDirection, intensity: 2.5 }),
};

render(scene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const y = Math.floor(surface.height / 2);
  const left = getSurfacePixelLuminance(surface, Math.floor(surface.width * 0.43), y);
  const right = getSurfacePixelLuminance(surface, Math.floor(surface.width * 0.57), y);
  if (left <= right + 25) {
    throw new Error(`[shading-normal-map] tangent-space halves did not separate (left ${left}, right ${right})`);
  }
}
