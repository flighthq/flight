import type { FogModifierMode } from './FogModifier';

export interface FogModifierOptions {
  color: number;
  mode?: FogModifierMode;
  near?: number;
  far?: number;
  density?: number;
}
