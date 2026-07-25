import { reportImportDiagnostic } from '@flighthq/importdiagnostics';
import { createParticleEmitterConfig } from '@flighthq/particles';
import type {
  ImportDiagnostic,
  ParticleFormatCodec,
  ParticleFormatKind,
  ParticleConfigParseResult,
} from '@flighthq/types';
import { ImportDiagnosticSeverity } from '@flighthq/types';

/** Contract for a particle format codec registered via `registerParticleFormat`.
 *
 *  A codec provides the three operations needed to integrate a format into the
 *  unified dispatcher: format detection, config parse, and serialize.
 *
 *  `detect` should return `true` when the text is confidently recognized as this format —
 *  it must not throw. `parseToConfig` and `parseToDocument` may throw on genuinely
 *  malformed input; the dispatcher catches errors and returns a `particles.parse-error` diagnostic. */
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
 *  Returns a `ParticleConfigParseResult` with the config, format, and any structured import diagnostics.
 *  When no codec is registered for `kind`, returns a default config with a `particles.unknown-format` Reject
 *  diagnostic. Codec errors are caught and returned as a `particles.parse-error` Reject. */
export function parseRegisteredParticleFormat(text: string, kind: string): ParticleConfigParseResult {
  const codec = _registry.get(kind);
  if (!codec) {
    const diagnostics: ImportDiagnostic[] = [];
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'particles.unknown-format',
      'parseRegisteredParticleFormat',
      {
        reason: 'no-registered-codec',
      },
    );
    return { config: createParticleEmitterConfig(), diagnostics, format: kind };
  }
  try {
    const result = codec.parseToDocument(text);
    return { config: result.config, diagnostics: result.diagnostics, format: kind };
  } catch (err) {
    const diagnostics: ImportDiagnostic[] = [];
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'particles.parse-error',
      'parseRegisteredParticleFormat',
      {
        message: (err as Error).message,
      },
    );
    return { config: createParticleEmitterConfig(), diagnostics, format: kind };
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
