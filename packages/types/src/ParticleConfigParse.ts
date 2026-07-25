import type { ImportDiagnostic } from './ImportDiagnostic';
import type { LibgdxParseOptions } from './LibgdxParticleSchema';
import type { ParticleDesignerParseOptions } from './ParticleDesignerSchema';
import type { ParticleEmitterConfig } from './ParticleEmitterConfig';
import type { StarlingPexParseOptions } from './StarlingPexSchema';
import type { UnityParseOptions } from './UnitySchema';

export interface ParseParticleConfigOptions
  extends ParticleDesignerParseOptions, UnityParseOptions, LibgdxParseOptions, StarlingPexParseOptions {}

export interface ParticleConfigParseResult {
  config: ParticleEmitterConfig;
  /** Structured import diagnostics: features the parse dropped, skipped, recovered, or the whole-input
   *  Reject (an `'unknown-format'` / `'parse-error'` kind) when no format matched or a codec threw and the
   *  result is a default config. */
  diagnostics: ImportDiagnostic[];
  /** The detected format kind, or `null` when no format matched. */
  format: string | null;
}
