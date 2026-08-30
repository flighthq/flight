import { getCanvasPipelineRegistries, scene2dCanvasPipeline } from '@flighthq/scene2d-canvas';

const registries = getCanvasPipelineRegistries(scene2dCanvasPipeline);
Reflect.set(globalThis, '__flightScene2dCanvasPipeline', { pipeline: scene2dCanvasPipeline, registries });
