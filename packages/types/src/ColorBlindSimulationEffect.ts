import type { RenderEffect } from './RenderEffect';
export type ColorBlindType =
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia'
  | 'protanomaly'
  | 'deuteranomaly'
  | 'tritanomaly'
  | 'achromatopsia'
  | 'achromatomaly';
export interface ColorBlindSimulationEffect extends RenderEffect {
  kind: 'ColorBlindSimulationEffect';
  type?: ColorBlindType;
}
