import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import {
  drawWgpuScene3D,
  registerBuiltInWgpuModifierSnippets,
  registerWgpuShadedMaterial,
  setWgpuScene3DTime,
} from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
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
  createScene3DLights,
  createShadedMaterial,
  createSphereMeshGeometry,
  createTexture,
  createVector2,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  scene2dWgpuPipeline,
  EmissiveModifierFacing,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  normalizeVector3,
  prepareScene3DRender,
  registerWgpuImageTextureResolver,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an 800×600 almost-black navy field (about R5 G7 B12), a single large circular blue globe is ' +
    'centred near (400,300). Its screen-right day hemisphere is brightly lit; the screen-left night ' +
    'hemisphere remains visible and contains scattered warm yellow city-light clusters instead of ' +
    'falling to black. Subtle normal-map variation breaks up the blue surface, and a cool cyan ' +
    'atmospheric rim is strongest near the silhouette. The globe stays circular and bounded, with no ' +
    'second sphere, flat unshaded disk or city lights on the surrounding field.',
);

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, scene2dWgpuPipeline, {
  pixelRatio,
  backgroundColor: 0x05070cff,
});
registerWgpuImageTextureResolver(state);
registerWgpuShadedMaterial(state);
registerBuiltInWgpuModifierSnippets(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  setWgpuScene3DTime(state, 0.35);
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
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
      map: createTexture({
        colorSpace: 'linear',
        dimension: '2d',
        source: createImageResourceFromCanvas(oceanNormalCanvas()),
      }),
      scroll: createVector2(0.05, 0.02),
      strength: 0.6,
    }),
    createEmissiveModifier({
      color: 0xffd27fff,
      strength: 3,
      mask: createTexture({
        colorSpace: 'linear',
        dimension: '2d',
        source: createImageResourceFromCanvas(cityLightsCanvas()),
      }),
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

const scene = createScene3D().root;
addNodeChild(scene, createMesh(geometry, [material]));

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3.2), createVector3(0, 0, 0), createVector3(0, 1, 0));

const sunDirection = createVector3(-1, -0.25, -0.5);
normalizeVector3(sunDirection, sunDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x35406aff, intensity: 0.12 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: sunDirection, intensity: 3 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const centerX = Math.floor(bitmap.width / 2);
  const centerY = Math.floor(bitmap.height / 2);
  const offset = Math.floor(bitmap.width * 0.06);
  const dayLuminance = getBitmapPixelLuminance(bitmap, centerX + offset, centerY);
  let nightHighlight = 0;
  for (let y = Math.floor(bitmap.height * 0.2); y < Math.floor(bitmap.height * 0.8); y += 4) {
    for (let x = Math.floor(bitmap.width * 0.2); x < centerX; x += 4) {
      nightHighlight = Math.max(nightHighlight, getBitmapPixelLuminance(bitmap, x, y));
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
