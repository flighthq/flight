import type { ParticleEmitterConfig } from './ParticleEmitterConfig';

export interface PixiParseResult {
  config: ParticleEmitterConfig;
  /** Features present in the source that the common-subset importer cannot
   *  represent and silently dropped — surface these in your asset pipeline. */
  warnings: string[];
}

export type PixiParsed = PixiParseResult;
