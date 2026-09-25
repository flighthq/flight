import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { LibgdxParseOptions } from './LibgdxParticleSchema.ts';
import type { ParticleDesignerParseOptions } from './ParticleDesignerSchema.ts';
import type { ParticleEmitterConfig } from './ParticleEmitterConfig.ts';
import type { StarlingPexParseOptions } from './StarlingPexSchema.ts';
import type { UnityParseOptions } from './UnitySchema.ts';

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
