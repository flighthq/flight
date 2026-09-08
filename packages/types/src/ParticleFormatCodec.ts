import type { ImportDiagnostic } from './ImportDiagnostic';
import type { ParseParticleConfigOptions } from './ParticleConfigParse';
import type { ParticleEmitterConfig } from './ParticleEmitterConfig';
import type { ParticleSerializeResult } from './ParticleSerializeResult';

export interface ParticleFormatCodec {
  /** Return `true` when `text` is recognisable as this format. Must not throw. */
  detect(text: string): boolean;
  /** Parse `text` and return a `ParticleEmitterConfig`. May throw on malformed input. */
  parseToConfig(text: string, options?: Readonly<ParseParticleConfigOptions>): ParticleEmitterConfig;
  /** Parse `text` and return `{ config, diagnostics }`. May throw on malformed input.
   *  Return an empty `diagnostics` array when nothing is lossy. */
  parseToDocument(
    text: string,
    options?: Readonly<ParseParticleConfigOptions>,
  ): {
    config: ParticleEmitterConfig;
    diagnostics: ImportDiagnostic[];
  };
  /** Serialize `config` to the format string when the format supports export.
   *  May accept optional options via closure capture in the codec implementation. */
  serialize?(config: Readonly<ParticleEmitterConfig>): ParticleSerializeResult;
}
