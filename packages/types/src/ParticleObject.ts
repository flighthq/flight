import type { HasAppearance } from './HasAppearance';
import type { HasColorScaleBias } from './HasColorScaleBias';
import type { HasTransform2D } from './HasTransform2D';

export type ParticleObject = HasTransform2D & HasAppearance & HasColorScaleBias;
