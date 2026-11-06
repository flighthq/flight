import type { Material } from '@flighthq/materials/contract';

// Declarative Canvas draw-state delta. The renderer applies these sparse fields around a draw;
// alpha remains part of the universal node appearance path rather than material policy.
export interface CanvasMaterialState {
  composite?: GlobalCompositeOperation;
  filter?: string;
}

export interface CanvasQuadMaterialRenderer {
  getState(material: Readonly<Material>): CanvasMaterialState;
}
