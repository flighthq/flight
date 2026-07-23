import type { LibgdxParseOptions } from './LibgdxParticleSchema';
import type { ParticleDesignerParseOptions } from './ParticleDesignerSchema';
import type { ParticleEmitterConfig } from './ParticleEmitterConfig';
import type { StarlingPexParseOptions } from './StarlingPexSchema';
import type { UnityParseOptions } from './UnitySchema';

export interface ParseParticleConfigOptions
  extends ParticleDesignerParseOptions, UnityParseOptions, LibgdxParseOptions, StarlingPexParseOptions {}

export interface ParticleConfigParseResult {
  config: ParticleEmitterConfig;
  /** The detected format kind, or `null` when no format matched. */
  format: string | null;
  /** Features dropped or approximated during the parse, including an
   *  `'unknown-format'` entry when no format matched and the result is a
   *  default config. */
  warnings: string[];
}
