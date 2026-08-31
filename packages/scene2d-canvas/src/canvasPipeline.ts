import { createEntity } from '@flighthq/entity/contract';
import { createKeyedTable, createSlotTable } from '@flighthq/registry/contract';
import type { CanvasPipeline, CanvasRenderRegistries } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export function createCanvasPipeline(registries: Readonly<CanvasRenderRegistries>): CanvasPipeline {
  const pipeline = createEntity({ registries }) as CanvasPipeline;
  pipeline[EntityRuntimeKey] = { binding: null };
  return pipeline;
}

export function createEmptyCanvasRegistries(): CanvasRenderRegistries {
  return {
    renderEffects: createKeyedTable('CanvasRenderEffect', 'Unregistered'),
    renderers: createKeyedTable('NodeRenderer', 'Unregistered'),
    strokeTessellator: createSlotTable('StrokeTessellator', 'Rasterize'),
  };
}

export function getCanvasPipelineRegistries(pipeline: Readonly<CanvasPipeline>): Readonly<CanvasRenderRegistries> {
  return pipeline.registries;
}
