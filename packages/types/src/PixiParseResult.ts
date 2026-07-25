import type { ImportDiagnostic } from './ImportDiagnostic';
import type { ParticleEmitterConfig } from './ParticleEmitterConfig';

export interface PixiParseResult {
  config: ParticleEmitterConfig;
  /** Structured import diagnostics: features the source carries that the common-subset importer dropped,
   *  skipped, or recovered — surface these in your asset pipeline to audit import fidelity. */
  diagnostics: ImportDiagnostic[];
}

export type PixiParsed = PixiParseResult;
