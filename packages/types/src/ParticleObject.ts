import type { HasAppearance } from './HasAppearance';
import type { HasColorTransform } from './HasColorTransform';
import type { HasTransform2D } from './HasTransform2D';

export type ParticleObject = HasTransform2D & HasAppearance & HasColorTransform;
