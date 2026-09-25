import type { HasAppearance } from './HasAppearance.ts';
import type { HasColorScaleBias } from './HasColorScaleBias.ts';
import type { HasTransform2D } from './HasTransform2D.ts';

export type ParticleObject = HasTransform2D & HasAppearance & HasColorScaleBias;
