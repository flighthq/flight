import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createCamera3D,
  createParticleEmitter3D,
  createPerspectiveProjection,
  createScene3D,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixel,
  prepareScene3DRender,
  renderWgpuBackground,
  reserveParticleEmitter3D,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// Real-WebGPU proof for the ParticleEmitter3D path that drawWgpuScene3D invokes automatically. Three
// untextured camera-facing instances carry independent positions and color tints.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);
export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101018ff });
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

const scene = createScene3D().root;
const emitter = createParticleEmitter3D();
reserveParticleEmitter3D(emitter, 3);
emitter.data.particleCount = 3;
const positions = [-1.2, 0, 1.2];
const colors: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
for (let particle = 0; particle < 3; particle++) {
  emitter.data.ids[particle] = 0;
  emitter.data.alphas[particle] = 1;
  emitter.data.positionsZ[particle] = 0;
  emitter.data.transforms[particle * 4] = positions[particle];
  emitter.data.transforms[particle * 4 + 1] = 0;
  emitter.data.transforms[particle * 4 + 2] = particle * 0.35;
  emitter.data.transforms[particle * 4 + 3] = 0.9;
  emitter.data.colors.set(colors[particle], particle * 3);
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
  const probes: readonly (readonly [number, readonly [number, number, number]])[] = [
    [0.344, [255, 0, 0]],
    [0.5, [0, 255, 0]],
    [0.656, [0, 0, 255]],
  ];
  for (const [x, expected] of probes) {
    const pixel = getBitmapPixel(bitmap, Math.floor(bitmap.width * x), Math.floor(bitmap.height * 0.5));
    const actual = [(pixel >>> 24) & 0xff, (pixel >>> 16) & 0xff, (pixel >>> 8) & 0xff];
    for (let channel = 0; channel < 3; channel++) {
      if (expected[channel] > 128 ? actual[channel] < 150 : actual[channel] > 100) {
        throw new Error(`[particle-emitter-3d] color probe ${x} is #${(pixel >>> 8).toString(16).padStart(6, '0')}`);
      }
    }
  }
}
