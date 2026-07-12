import type { ColorBlindSimulationAdjustment, ColorBlindType } from '@flighthq/types';

// Color-vision-deficiency simulation as a matrix-tier adjustment — this op's FIRST backend realization
// (it was previously a descriptor-only effect with no pass). Each type bakes a fixed linear 3×3 RGB→RGB
// matrix (no offset, alpha unchanged), so it fuses and folds like any color matrix.
//
// Matrices are the standard linear color-blindness simulation set from the HCIRN Color Blind Simulation
// function, as popularized by Matthew Wickline's "Colorblind Web Page Filter" (2000) and widely reproduced
// (e.g. the `color-blind` npm package). The three dichromacies (protan/deutan/tritan -opia) are the full
// simulations; the -omaly forms are the published partial (anomalous-trichromacy) matrices; achromatopsia
// is full luma monochromacy and achromatomaly its partial form.
export function createColorBlindSimulationAdjustment(
  options: Readonly<Omit<ColorBlindSimulationAdjustment, 'kind' | 'colorMatrix'>> = {},
): ColorBlindSimulationAdjustment {
  const type: ColorBlindType = options.type ?? 'deuteranopia';
  const m = COLOR_BLIND_MATRICES[type];
  // prettier-ignore
  const colorMatrix = [
    m[0], m[1], m[2], 0, 0,
    m[3], m[4], m[5], 0, 0,
    m[6], m[7], m[8], 0, 0,
    0, 0, 0, 1, 0,
  ];
  return { kind: 'ColorBlindSimulationAdjustment', ...options, colorMatrix };
}

// Row-major 3×3 RGB→RGB coefficients per deficiency (HCIRN / Wickline simulation set).
const COLOR_BLIND_MATRICES: Readonly<Record<ColorBlindType, readonly number[]>> = {
  protanopia: [0.567, 0.433, 0.0, 0.558, 0.442, 0.0, 0.0, 0.242, 0.758],
  protanomaly: [0.817, 0.183, 0.0, 0.333, 0.667, 0.0, 0.0, 0.125, 0.875],
  deuteranopia: [0.625, 0.375, 0.0, 0.7, 0.3, 0.0, 0.0, 0.3, 0.7],
  deuteranomaly: [0.8, 0.2, 0.0, 0.258, 0.742, 0.0, 0.0, 0.142, 0.858],
  tritanopia: [0.95, 0.05, 0.0, 0.0, 0.433, 0.567, 0.0, 0.475, 0.525],
  tritanomaly: [0.967, 0.033, 0.0, 0.0, 0.733, 0.267, 0.0, 0.183, 0.817],
  achromatopsia: [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114],
  achromatomaly: [0.618, 0.32, 0.062, 0.163, 0.775, 0.062, 0.163, 0.32, 0.516],
};
