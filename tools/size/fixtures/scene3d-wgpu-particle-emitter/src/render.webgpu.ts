import { createCamera3D, createPerspectiveProjection, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { createWebWgpuCanvasElement } from '@flighthq/host-web';
import { createScene3DLights } from '@flighthq/lighting';
import { addNodeChild } from '@flighthq/node';
import { appendParticleEmitter3DParticle, createParticleEmitter3D } from '@flighthq/particleemitter';
import { prepareScene3DRender } from '@flighthq/render';
import {
  beginWgpuRenderPass,
  createWgpuAcquisition,
  createWgpuPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderPass,
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRegistries } from '@flighthq/render-wgpu/contract';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';

const canvas = createWebWgpuCanvasElement(320, 240, 1);
document.body.style.margin = '0';
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, createWgpuPipeline(createEmptyWgpuRegistries()), {
  format: acquisition.format,
  pixelRatio: 1,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
export const screenClear = { color: [0x10 / 0xff, 0x15 / 0xff, 0x22 / 0xff, 1], depth: 1.0 } as const;
const scene = createScene3D().root;
const emitter = createParticleEmitter3D();
appendParticleEmitter3DParticle(emitter, 0, -0.65, -0.2, 0, 0, 0.5);
appendParticleEmitter3DParticle(emitter, 1, 0, 0.45, 0, 0, 0.6);
appendParticleEmitter3DParticle(emitter, 2, 0.65, -0.2, 0, 0, 0.5);
addNodeChild(scene, emitter);
const camera = createCamera3D({
  far: 10,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: 4 / 3, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));
const lights = createScene3DLights();

export { camera, lights, scene };

const pass = beginWgpuRenderPass(state, screen, screenClear);
prepareScene3DRender(state, scene, camera, lights);
drawWgpuScene3D(pass, scene, camera, lights);
endWgpuRenderPass(pass);

Reflect.set(globalThis, '__flightScene3dWgpuParticleEmitter', { emitter, state });
