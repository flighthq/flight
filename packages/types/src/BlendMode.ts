import type { BlendMode as MaterialsBlendMode } from '@flighthq/materials/contract';

// Runtime compatibility facade; the contract type is owned by materials.
export const BlendMode = {
  Add: 'Add',
  Darken: 'Darken',
  Lighten: 'Lighten',
  Multiply: 'Multiply',
  Normal: 'Normal',
  Screen: 'Screen',
} as const;

export type BlendMode = MaterialsBlendMode;
