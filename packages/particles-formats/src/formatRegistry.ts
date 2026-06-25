import { createParticleEmitterConfig } from '@flighthq/particles';
import type { ParticleEmitterConfig } from '@flighthq/types';
import type { ParticleFormatKind } from '@flighthq/types';

import type { ParticleConfigParseResult } from './parseParticleConfig';
import type { ParticleSerializeResult } from './serializeResult';

/** Contract for a particle format codec registered via `registerParticleFormat`.
 *
 *  A codec provides the three operations needed to integrate a format into the
 *  unified dispatcher: format detection, config parse, and serialize.
 *
 *  `detect` should return `true` when the text is confidently recognized as this format —
 *  it must not throw. `parseToConfig` and `parseToDocument` may throw on genuinely
 *  malformed input; the dispatcher catches and wraps errors as warnings. */
export interface ParticleFormatCodec {
  /** Return `true` when `text` is recognisable as this format. Must not throw. */
  detect(text: string): boolean;
  /** Parse `text` and return a `ParticleEmitterConfig`. May throw on malformed input. */
  parseToConfig(text: string): ParticleEmitterConfig;
  /** Parse `text` and return `{ config, warnings }`. May throw on malformed input.
   *  Return an empty `warnings` array when nothing is lossy. */
  parseToDocument(text: string): {
    config: ParticleEmitterConfig;
    warnings: string[];
  };
  /** Serialize `config` to the format string.
   *  May accept optional options via closure capture in the codec implementation. */
  serialize(config: Readonly<ParticleEmitterConfig>): ParticleSerializeResult;
}

/** Detect the format of `text` by consulting all registered codecs in registration order.
 *
 *  Returns the first `kind` whose codec's `detect` returns `true`, or `null` when no
 *  registered codec recognises the input. Codecs are consulted in the order they were
 *  registered; last-write-wins replacement does not change detection order (the replaced
 *  kind retains its original position).
 *
 *  This is the registry-backed counterpart of `detectParticleFormat`. */
export function detectRegisteredParticleFormat(text: string): string | null {
  for (const [kind, codec] of _registry) {
    try {
      if (codec.detect(text)) return kind;
    } catch {
      // A codec detect() must not throw; ignore any that do.
    }
  }
  return null;
}

/** Return the registered codec for `kind`, or `null` when no codec is registered. */
export function getParticleFormatCodec(kind: ParticleFormatKind): ParticleFormatCodec | null {
  return _registry.get(kind) ?? null;
}

/** Return all currently registered format kinds. */
export function getRegisteredParticleFormats(): ReadonlyArray<string> {
  return [..._registry.keys()];
}

/** Parse `text` using the registered codec for `kind`.
 *
 *  Returns a `ParticleConfigParseResult` with the config, format, and any import warnings.
 *  When no codec is registered for `kind`, returns a default config with an
 *  `'unknown-format'` warning. Codec errors are caught and returned as `'parse-error'` warnings. */
export function parseRegisteredParticleFormat(text: string, kind: string): ParticleConfigParseResult {
  const codec = _registry.get(kind);
  if (!codec) {
    return {
      config: createParticleEmitterConfig(),
      format: kind,
      warnings: [`unknown-format: format '${kind}' has no registered codec`],
    };
  }
  try {
    const result = codec.parseToDocument(text);
    return { config: result.config, format: kind, warnings: result.warnings };
  } catch (err) {
    return {
      config: createParticleEmitterConfig(),
      format: kind,
      warnings: [`parse-error: ${(err as Error).message}`],
    };
  }
}

/** Register a particle format codec for the given `kind`.
 *
 *  Last-write-wins: registering the same kind again replaces the previous codec.
 *  Built-in kinds (bare names, no dot) are registered at module load time by the
 *  format packages themselves; custom/vendor kinds use a dotted namespace prefix
 *  (e.g. `'acme.Custom'`).
 *
 *  This function must be called explicitly — there is no implicit registration at
 *  module load time. */
export function registerParticleFormat(kind: ParticleFormatKind, codec: ParticleFormatCodec): void {
  _registry.set(kind, codec);
}

/** Remove a previously registered format codec. Returns `true` if the kind was found
 *  and removed, `false` if it was not registered. */
export function unregisterParticleFormat(kind: ParticleFormatKind): boolean {
  return _registry.delete(kind);
}

// The format registry: last-write-wins per kind (matches the SDK's kind-registration pattern).
const _registry = new Map<string, ParticleFormatCodec>();
