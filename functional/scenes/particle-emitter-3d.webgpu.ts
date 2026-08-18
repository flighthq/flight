import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  addTextureAtlasRegion,
  beginWgpuRenderEffectPipeline,
  createCamera3D,
  createImageResourceFromCanvas,
  createParticleEmitter3D,
  createPerspectiveProjection,
  createScene3D,
  createTexture,
  createTextureAtlas,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixel,
  prepareScene3DRender,
  registerWgpuImageTextureResolver,
  renderWgpuBackground,
  reserveParticleEmitter3D,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'An 800×600 dark field (0x101018) with three equally spaced translucent warm-orange squares centered vertically at 0.5*H = 300. The assertion probes at x fractions 0.344, 0.5, 0.656 give centers near 0.344*W = 275, 0.5*W = 400, 0.656*W = 525, each roughly 93 px wide. Each square composites to approximately a muted brown-orange over the dark background due to half-opacity orange fill (rgba 224, 96, 48, 0.5) over the dark field. Gaps between the squares and all frame edges show the dark background. No lighting is applied.',
);

// Real-WebGPU proof for the ParticleEmitter3D path that drawWgpuScene3D invokes automatically. The
// colored, partially-transparent sRGB atlas distinguishes post-decode shader premultiplication from an
// encoded-byte upload multiply; white or opaque pixels cannot expose that ordering error.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);
export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101018ff });
registerWgpuImageTextureResolver(state);
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

const ATLAS_SIZE = 64;
const PARTICLE_ALPHA = 0.5;

const scene = createScene3D().root;
const emitter = createParticleEmitter3D();
const atlas = createTextureAtlas({
  // The default sRGB declaration is intentional: the resolver decodes these colored atlas pixels into
  // the linear scene target before the particle shader applies alpha.
  texture: createTexture({ dimension: '2d', source: createImageResourceFromCanvas(makeAtlasCanvas()) }),
});
addTextureAtlasRegion(atlas, 0, 0, ATLAS_SIZE, ATLAS_SIZE);
emitter.data.atlas = atlas;
reserveParticleEmitter3D(emitter, 3);
emitter.data.particleCount = 3;
const positions = [-1.2, 0, 1.2];
for (let particle = 0; particle < 3; particle++) {
  emitter.data.ids[particle] = 0;
  emitter.data.alphas[particle] = PARTICLE_ALPHA;
  emitter.data.positionsZ[particle] = 0;
  emitter.data.transforms[particle * 4] = positions[particle];
  emitter.data.transforms[particle * 4 + 1] = 0;
  emitter.data.transforms[particle * 4 + 2] = particle * 0.35;
  emitter.data.transforms[particle * 4 + 3] = 0.9;
  emitter.data.colors.set([1, 1, 1], particle * 3);
}
addNodeChild(scene, emitter);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 3 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
render(scene, camera, createScene3DLights({ ambient: null, directional: null }));

export function assertRender(bitmap: Readonly<Bitmap>): void {
  for (const x of [0.344, 0.5, 0.656]) {
    const pixel = getBitmapPixel(bitmap, Math.floor(bitmap.width * x), Math.floor(bitmap.height * 0.5));
    const actual = [(pixel >>> 24) & 0xff, (pixel >>> 16) & 0xff, (pixel >>> 8) & 0xff];
    if (!isCorrectAtlasComposite(actual)) {
      throw new Error(
        `[particle-emitter-3d] colored translucent atlas probe ${x} is #${(pixel >>> 8).toString(16).padStart(6, '0')}`,
      );
    }
  }
}

function isCorrectAtlasComposite(rgb: readonly number[]): boolean {
  // Correct post-decode premultiplication lands near #793320 over the dark background. The encoded-byte
  // upload bug is much darker (about #52251b); omitting either alpha factor is much brighter (about
  // #a5672a), so this bounded check rejects both wrong equations on both GPU backends.
  return rgb[0] >= 105 && rgb[0] <= 145 && rgb[1] >= 40 && rgb[1] <= 70 && rgb[2] >= 25 && rgb[2] <= 50;
}

function makeAtlasCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'rgba(224,96,48,0.5)';
  context.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  return canvas;
}
