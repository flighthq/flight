import type { ColorMatrixAdjustment } from './ColorMatrixAdjustment';

// The color-vision-deficiency variants a ColorBlindSimulationAdjustment can bake. The three dichromacies
// (protan/deutan/tritan -opia) plus their anomalous-trichromacy (-omaly) partial forms and the two
// monochromacies (achromatopsia = full, achromatomaly = partial).
export type ColorBlindType =
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia'
  | 'protanomaly'
  | 'deuteranomaly'
  | 'tritanomaly'
  | 'achromatopsia'
  | 'achromatomaly';

export interface ColorBlindSimulationAdjustment extends ColorMatrixAdjustment {
  kind: 'ColorBlindSimulationAdjustment';
  type?: ColorBlindType; // which deficiency to simulate. Default 'deuteranopia'.
}
