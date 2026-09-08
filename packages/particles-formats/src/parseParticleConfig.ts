import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createParticleEmitterConfig } from '@flighthq/particles/contract';
import type {
  ImportDiagnostic,
  ParseParticleConfigOptions,
  ParticleConfigParseResult,
  ParticleEmitterConfig,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { detectParticleFormat } from './detect';
import { getParticleFormatCodec } from './formatRegistry';
/** Parse any supported particle format string to a ParticleEmitterConfig.
 *
 *  Calls `detectParticleFormat` internally and routes to the format-specific
 *  parser. When the format cannot be detected, or a per-format parser throws, it
 *  returns a default config rather than throwing.
 *
 *  Use `parseParticleConfigDocument` instead when you need the full document plus
 *  structured import diagnostics for round-trip serialisation. */
export function parseParticleConfig(text: string, options?: ParseParticleConfigOptions): ParticleEmitterConfig {
  const format = detectParticleFormat(text);
  if (format === null) return createParticleEmitterConfig();
  const codec = getParticleFormatCodec(format);
  if (codec === null) return createParticleEmitterConfig();
  try {
    return codec.parseToConfig(text, options);
  } catch {
    return createParticleEmitterConfig();
  }
}

/** Parse any supported particle format string and return the config, detected
 *  format, and any structured import diagnostics.
 *
 *  Unknown or unparseable input returns a default config with a `particles.unknown-format` or
 *  `particles.parse-error` Reject diagnostic rather than throwing. The per-format parsers own their own
 *  Drop/Skip/Recover diagnostics, forwarded here unchanged. */
export function parseParticleConfigDocument(
  text: string,
  options?: ParseParticleConfigOptions,
): ParticleConfigParseResult {
  const format = detectParticleFormat(text);
  if (format === null) {
    const diagnostics: ImportDiagnostic[] = [];
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'particles.unknown-format',
      'parseParticleConfigDocument',
      {
        reason: 'no-format-detected',
      },
    );
    return { config: createParticleEmitterConfig(), diagnostics, format: null };
  }
  const codec = getParticleFormatCodec(format);
  if (codec === null) {
    const diagnostics: ImportDiagnostic[] = [];
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'particles.unknown-format',
      'parseParticleConfigDocument',
      {
        reason: 'no-registered-parser',
      },
    );
    return { config: createParticleEmitterConfig(), diagnostics, format };
  }
  try {
    const result = codec.parseToDocument(text, options);
    return { config: result.config, diagnostics: result.diagnostics, format };
  } catch (err) {
    const diagnostics: ImportDiagnostic[] = [];
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'particles.parse-error',
      'parseParticleConfigDocument',
      {
        message: (err as Error).message,
      },
    );
    return { config: createParticleEmitterConfig(), diagnostics, format };
  }
}
