import { createParticleEmitterConfig } from '@flighthq/particles';
import type { ParseParticleConfigOptions, ParticleConfigParseResult, ParticleEmitterConfig } from '@flighthq/types';
import {
  LibgdxParticleFormatKind,
  ParticleDesignerFormatKind,
  PixiParticleFormatKind,
  SpineParticleFormatKind,
  StarlingPexFormatKind,
  UnityParticleFormatKind,
} from '@flighthq/types';

import { detectParticleFormat } from './detect';
import { parseLibgdxParticle, parseLibgdxParticleDocument } from './libgdxParse';
import { parseParticleDesignerPlist, parseParticleDesignerPlistDocument } from './particleDesignerParse';
import { parsePixiParticle, parsePixiParticleDocument } from './pixiParse';
import { parseSpineParticle, parseSpineParticleDocument } from './spineParse';
import { parseStarlingPex, parseStarlingPexDocument } from './starlingPexParse';
import { parseUnityParticle, parseUnityParticleDocument } from './unityParse';
/** Parse any supported particle format string to a ParticleEmitterConfig.
 *
 *  Calls `detectParticleFormat` internally and routes to the format-specific
 *  parser. When the format cannot be detected the result carries a default
 *  config and a `warnings` entry of `'unknown-format: <reason>'` rather than
 *  throwing — follow-up parsing errors from the per-format parsers are also
 *  caught and returned as warnings.
 *
 *  Use `parseParticleConfigDocument` instead when you need the full document
 *  for round-trip serialisation. */
export function parseParticleConfig(text: string, options?: ParseParticleConfigOptions): ParticleEmitterConfig {
  const format = detectParticleFormat(text);
  if (format === null) return createParticleEmitterConfig();
  try {
    if (format === LibgdxParticleFormatKind) return parseLibgdxParticle(text, options);
    if (format === ParticleDesignerFormatKind) return parseParticleDesignerPlist(text, options);
    if (format === PixiParticleFormatKind) return parsePixiParticle(text);
    if (format === SpineParticleFormatKind) return parseSpineParticle(text);
    if (format === StarlingPexFormatKind) return parseStarlingPex(text, options);
    if (format === UnityParticleFormatKind) return parseUnityParticle(text, options);
  } catch {
    return createParticleEmitterConfig();
  }
  return createParticleEmitterConfig();
}

/** Parse any supported particle format string and return the config, detected
 *  format, and any import warnings.
 *
 *  Unknown or unparseable input returns a default config with a warning entry
 *  of `'unknown-format'` rather than throwing. */
export function parseParticleConfigDocument(
  text: string,
  options?: ParseParticleConfigOptions,
): ParticleConfigParseResult {
  const format = detectParticleFormat(text);
  if (format === null) {
    return {
      config: createParticleEmitterConfig(),
      format: null,
      warnings: ['unknown-format: input did not match any supported particle format'],
    };
  }
  try {
    if (format === LibgdxParticleFormatKind) {
      const result = parseLibgdxParticleDocument(text, options);
      return { config: result.config, format, warnings: result.warnings };
    }
    if (format === ParticleDesignerFormatKind) {
      const result = parseParticleDesignerPlistDocument(text, options);
      return { config: result.config, format, warnings: result.warnings };
    }
    if (format === PixiParticleFormatKind) {
      const result = parsePixiParticleDocument(text);
      return { config: result.config, format, warnings: result.warnings };
    }
    if (format === SpineParticleFormatKind) {
      const result = parseSpineParticleDocument(text);
      return { config: result.config, format, warnings: result.warnings };
    }
    if (format === StarlingPexFormatKind) {
      const result = parseStarlingPexDocument(text, options);
      return { config: result.config, format, warnings: result.warnings };
    }
    if (format === UnityParticleFormatKind) {
      const result = parseUnityParticleDocument(text, options);
      return { config: result.config, format, warnings: result.warnings };
    }
  } catch (err) {
    return {
      config: createParticleEmitterConfig(),
      format,
      warnings: [`parse-error: ${(err as Error).message}`],
    };
  }
  return {
    config: createParticleEmitterConfig(),
    format,
    warnings: [`unknown-format: format '${format}' has no registered parser`],
  };
}
