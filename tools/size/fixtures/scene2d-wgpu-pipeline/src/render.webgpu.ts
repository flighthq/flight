import { scene2dWgpuPipeline } from '@flighthq/scene2d-wgpu';

const registries = scene2dWgpuPipeline.registries;
Reflect.set(globalThis, '__flightScene2dWgpuPipeline', { pipeline: scene2dWgpuPipeline, registries });
