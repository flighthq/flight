import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createKeyedTable, createSlotTable } from '@flighthq/registry/contract';
import type { CanvasPipeline, CanvasRenderRegistries, EntityConstruction } from '@flighthq/types/contract';

export function createCanvasPipeline(registries: Readonly<CanvasRenderRegistries>): CanvasPipeline {
  return { registries } as CanvasPipeline;
}

export function createEmptyCanvasRegistries(): CanvasRenderRegistries {
  const out = allocateEntity<CanvasRenderRegistries>();
  initializeEmptyCanvasRegistries(out);
  return finishEntity(out);
}

export function getCanvasPipelineRegistries(pipeline: Readonly<CanvasPipeline>): Readonly<CanvasRenderRegistries> {
  return pipeline.registries;
}

export function initializeEmptyCanvasRegistries(out: EntityConstruction<CanvasRenderRegistries>): void {
  out.renderEffects = createKeyedTable('CanvasRenderEffect', 'Unregistered');
  out.renderers = createKeyedTable('NodeRenderer', 'Unregistered');
  out.strokeTessellator = createSlotTable('StrokeTessellator', 'Rasterize');
}
