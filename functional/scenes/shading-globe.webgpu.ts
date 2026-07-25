import { createScene } from '@flighthq/scene';
import {
  drawWgpuScene,
  registerBuiltInWgpuModifierSnippets,
  registerShadedWgpuMaterial,
  setWgpuSceneTime,
} from '@flighthq/scene-wgpu';
import type { Camera3D, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createAnimatedNormalModifier,
  createCamera3D,
  createDirectionalLight,
  createDissolveModifier,
  createEmissiveModifier,
  createImageResourceFromCanvas,
  createMesh,
  createPerspectiveProjection,
  createRimModifier,
  createShadedMaterial,
  createSphereMeshGeometry,
  createTexture,
  createVector2,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  EmissiveModifierFacing,
  endWgpuRenderEffectPipeline,
  getSurfacePixelLuminance,
  normalizeVector3,
  prepareSceneRender,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x05070cff,
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
  setWgpuSceneTime(state, 0.35);
  prepareSceneRender(state, scene, camera, lights);
  drawWgpuScene(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

const geometry = createSphereMeshGeometry(0.9, 64, 48);
const material = createShadedMaterial({
  diffuse: 0x1a3a6aff,
  specular: 0x223344ff,
  shininess: 24,
  modifiers: [
    createAnimatedNormalModifier({
      map: createTexture({ colorSpace: 'linear', image: createImageResourceFromCanvas(oceanNormalCanvas()) }),
      scroll: createVector2(0.05, 0.02),
      strength: 0.6,
    }),
    createEmissiveModifier({
      color: 0xffd27fff,
      strength: 3,
      mask: createTexture({ colorSpace: 'linear', image: createImageResourceFromCanvas(cityLightsCanvas()) }),
      facing: EmissiveModifierFacing.AwayFromLight,
      facingSoftness: 0.25,
    }),
    createRimModifier({ color: 0x4aa6ffff, power: 3, intensity: 1.6 }),
    // Repeated procedural modifiers share one helper declaration; this scene is the real WGSL compile
    // regression for declaration deduplication (threshold zero leaves the raster unchanged).
    createDissolveModifier({ threshold: 0 }),
    createDissolveModifier({ threshold: 0 }),
  ],
});

const scene = createScene().root;
addNodeChild(scene, createMesh(geometry, [material]));

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3.2), createVector3(0, 0, 0), createVector3(0, 1, 0));

const sunDirection = createVector3(-1, -0.25, -0.5);
normalizeVector3(sunDirection, sunDirection);
const lights = {
  ambient: createAmbientLight({ color: 0x35406aff, intensity: 0.12 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: sunDirection, intensity: 3 }),
};

render(scene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const centerX = Math.floor(surface.width / 2);
  const centerY = Math.floor(surface.height / 2);
  const offset = Math.floor(surface.width * 0.06);
  const dayLuminance = getSurfacePixelLuminance(surface, centerX + offset, centerY);
  let nightHighlight = 0;
  for (let y = Math.floor(surface.height * 0.2); y < Math.floor(surface.height * 0.8); y += 4) {
    for (let x = Math.floor(surface.width * 0.2); x < centerX; x += 4) {
      nightHighlight = Math.max(nightHighlight, getSurfacePixelLuminance(surface, x, y));
    }
  }

  if (dayLuminance <= 12) {
    throw new Error(`[shading-globe] day side is blank (luminance ${dayLuminance})`);
  }
  if (nightHighlight <= 80) {
    throw new Error(`[shading-globe] emissive night highlights are dark (peak luminance ${nightHighlight})`);
  }
}

function oceanNormalCanvas(): HTMLCanvasElement {
  const source = document.createElement('canvas');
  source.width = 64;
  source.height = 64;
  const context = source.getContext('2d')!;
  context.fillStyle = '#8080ff';
  context.fillRect(0, 0, 64, 64);
  for (let index = 0; index < 24; index++) {
    context.fillStyle = index % 2 === 0 ? '#a090ff' : '#6070ff';
    context.fillRect((index * 37) % 64, (index * 53) % 64, 6, 6);
  }
  return source;
}

function cityLightsCanvas(): HTMLCanvasElement {
  const source = document.createElement('canvas');
  source.width = 64;
  source.height = 64;
  const context = source.getContext('2d')!;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = '#ffffff';
  for (let index = 0; index < 40; index++) {
    context.fillRect((index * 29 + 7) % 64, (index * 47 + 3) % 64, 3, 3);
  }
  return source;
}
