import type { EntityConstruction, Kind, RenderEffect } from '@flighthq/types/contract';

export function initializeRenderEffect<T extends RenderEffect>(out: EntityConstruction<T>, kind: Kind): void {
  out.kind = kind;
}
