import { createScene3D } from '@flighthq/scene3d';
import {
  drawWgpuScene3D,
  registerBuiltInWgpuModifierSnippets,
  registerWgpuShadedMaterial,
} from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
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
  createScene3DLights,
  createShadedMaterial,
  createTexture,
  createToonModifier,
  createVector3,
  createVertexDisplaceModifier,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  normalizeVector3,
  prepareScene3DRender,
  registerWgpuImageTextureResolver,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
  VertexDisplaceModifierSource,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'On an 800×600 near-black navy field (about R8 G11 B18), one large pale blue, shallow box faces ' +
    'the viewer at the centre. Its front is split vertically by two authored tangent-space normals: ' +
    'the LEFT half is clearly brighter than the right by more than 25 luminance levels, while both ' +
    'halves retain stepped blue-grey shading. The split is a lighting change rather than a gap or ' +
    'colour bar; the box remains one continuous square silhouette. No uniform single shade, reversed ' +
    'brightness order, extra geometry or full-field clear is present.',
);

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x080b12ff,
});
registerWgpuImageTextureResolver(state);
registerWgpuShadedMaterial(state);
registerBuiltInWgpuModifierSnippets(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
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
    dimension: '2d',
    source: createImageResourceFromCanvas(normalSource),
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

const scene = createScene3D().root;
addNodeChild(scene, createMesh(createBoxMeshGeometry(2.4, 2.4, 0.15), [material]));

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

const lightDirection = createVector3(-1, 0, -1);
normalizeVector3(lightDirection, lightDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.03 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: lightDirection, intensity: 2.5 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const y = Math.floor(bitmap.height / 2);
  const left = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * 0.43), y);
  const right = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * 0.57), y);
  if (left <= right + 25) {
    throw new Error(`[shading-normal-map] tangent-space halves did not separate (left ${left}, right ${right})`);
  }
}
