//! The caller-owned particle format registry (TS `formatRegistry.ts`, whose module-level Map is
//! replaced by explicit D5 state).

use std::collections::HashMap;
use std::panic::{AssertUnwindSafe, catch_unwind};

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_particles::{ParticleEmitterConfig, create_particle_emitter_config};

use crate::types::*;

/// Registered codecs in first-registration order. Replacing a kind keeps its original position, as
/// `Map.set` does in the source, so detection precedence never moves on re-registration.
#[derive(Default)]
pub struct ParticleFormatRegistry {
    entries: Vec<(ParticleFormatKind, ParticleFormatCodec)>,
}

/// Allocates an empty registry (TS module-level `_registry`, D5 caller-owned).
// flight-lint: allow(conform-extra) D9: Rust constructor for the caller-owned registry replacing the source's module-level Map
pub fn create_particle_format_registry() -> ParticleFormatRegistry {
    return ParticleFormatRegistry {
        entries: Vec::new(),
    };
}

/// An empty config for the reject paths.
pub(crate) fn default_config() -> ParticleEmitterConfig {
    return create_particle_emitter_config(None);
}

/// Detects the format of `text` by consulting all registered codecs in registration order
/// (TS `detectRegisteredParticleFormat`). Returns the first matching kind, or `None`.
// flight-lint: allow(conform-params) D5: the source's module registry is explicit caller-owned state
pub fn detect_registered_particle_format(
    registry: &ParticleFormatRegistry,
    text: &str,
) -> Option<ParticleFormatKind> {
    for (kind, codec) in &registry.entries {
        if catch_unwind(AssertUnwindSafe(|| (codec.detect)(text))).unwrap_or(false) {
            return Some(kind.clone());
        }
    }
    return None;
}

/// Returns the registered codec for `kind`, or `None` (TS `getParticleFormatCodec`).
// flight-lint: allow(conform-params) D5: the source's module registry is explicit caller-owned state
pub fn get_particle_format_codec<'a>(
    registry: &'a ParticleFormatRegistry,
    kind: &str,
) -> Option<&'a ParticleFormatCodec> {
    return registry
        .entries
        .iter()
        .find(|(entry, _)| entry == kind)
        .map(|(_, codec)| codec);
}

/// Returns all currently registered format kinds in registration order (TS
/// `getRegisteredParticleFormats`).
// flight-lint: allow(conform-params) D5: the source's module registry is explicit caller-owned state
pub fn get_registered_particle_formats(
    out: &mut Vec<ParticleFormatKind>,
    registry: &ParticleFormatRegistry,
) {
    out.clear();
    out.extend(registry.entries.iter().map(|(kind, _)| kind.clone()));
}

/// Extracts a panic payload as text, mirroring the source's `(err as Error).message` prefix.
pub(crate) fn panic_message(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        return String::from(*message);
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    return String::from("particle codec panicked");
}

/// Parses `text` with the registered codec for `kind` (TS `parseRegisteredParticleFormat`). An
/// unknown kind yields a reject diagnostic; a codec panic becomes a `particles.parse-error` reject.
// flight-lint: allow(conform-params) D5: the source's module registry is explicit caller-owned state
pub fn parse_registered_particle_format(
    registry: &ParticleFormatRegistry,
    text: &str,
    kind: &str,
    options: Option<&ParseParticleConfigOptions>,
) -> ParticleConfigParseResult {
    let Some(codec) = get_particle_format_codec(registry, kind) else {
        let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
        report_import_diagnostic(
            Some(&mut diagnostics),
            ImportDiagnosticSeverity::Reject,
            "particles.unknown-format",
            "parseRegisteredParticleFormat",
            Some(string_detail("reason", "no-registered-codec")),
        );
        return ParticleConfigParseResult {
            config: create_particle_emitter_config(None),
            diagnostics,
            format: Some(String::from(kind)),
        };
    };
    match catch_unwind(AssertUnwindSafe(|| {
        (codec.parse_to_document)(text, options)
    })) {
        Ok(result) => {
            return ParticleConfigParseResult {
                config: result.config,
                diagnostics: result.diagnostics,
                format: Some(String::from(kind)),
            };
        }
        Err(payload) => {
            let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
            report_import_diagnostic(
                Some(&mut diagnostics),
                ImportDiagnosticSeverity::Reject,
                "particles.parse-error",
                "parseRegisteredParticleFormat",
                Some(string_detail("message", &panic_message(payload))),
            );
            return ParticleConfigParseResult {
                config: create_particle_emitter_config(None),
                diagnostics,
                format: Some(String::from(kind)),
            };
        }
    }
}

/// Registers a codec for `kind`; last write wins and keeps the kind's original position (TS
/// `registerParticleFormat`).
// flight-lint: allow(conform-params) D5: the source's module registry is explicit caller-owned state
pub fn register_particle_format(
    registry: &mut ParticleFormatRegistry,
    kind: &str,
    codec: ParticleFormatCodec,
) {
    if let Some((_, existing)) = registry.entries.iter_mut().find(|(entry, _)| entry == kind) {
        *existing = codec;
        return;
    }
    registry.entries.push((String::from(kind), codec));
}

/// Builds one string-valued diagnostic detail entry.
pub(crate) fn string_detail(
    key: &str,
    value: &str,
) -> HashMap<String, ImportDiagnosticDetailValue> {
    let mut detail = HashMap::new();
    detail.insert(
        String::from(key),
        ImportDiagnosticDetailValue::String(String::from(value)),
    );
    return detail;
}

/// Removes a registered codec, reporting whether the kind was present (TS
/// `unregisterParticleFormat`).
// flight-lint: allow(conform-params) D5: the source's module registry is explicit caller-owned state
pub fn unregister_particle_format(registry: &mut ParticleFormatRegistry, kind: &str) -> bool {
    let Some(position) = registry.entries.iter().position(|(entry, _)| entry == kind) else {
        return false;
    };
    registry.entries.remove(position);
    return true;
}
