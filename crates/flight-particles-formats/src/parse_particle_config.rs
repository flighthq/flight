//! Format-agnostic parsing (TS `parseParticleConfig.ts`).

use std::panic::{AssertUnwindSafe, catch_unwind};

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_particles::ParticleEmitterConfig;

use crate::detect::detect_particle_format;
use crate::format_registry::{
    ParticleFormatRegistry, default_config, get_particle_format_codec, panic_message, string_detail,
};
use crate::types::*;

/// Parses any supported particle format string to a config, returning a default config when the
/// format cannot be detected or the codec panics (TS `parseParticleConfig`).
// flight-lint: allow(conform-params) D5: the source's module registry is explicit caller-owned state
pub fn parse_particle_config(
    registry: &ParticleFormatRegistry,
    text: &str,
    options: Option<&ParseParticleConfigOptions>,
) -> ParticleEmitterConfig {
    let Some(format) = detect_particle_format(registry, text) else {
        return default_config();
    };
    let Some(codec) = get_particle_format_codec(registry, &format) else {
        return default_config();
    };
    return match catch_unwind(AssertUnwindSafe(|| (codec.parse_to_config)(text, options))) {
        Ok(config) => config,
        Err(_) => default_config(),
    };
}

/// Parses any supported particle format string and returns the config plus structured diagnostics
/// (TS `parseParticleConfigDocument`). Unknown or unparseable input yields a reject diagnostic.
// flight-lint: allow(conform-params) D5: the source's module registry is explicit caller-owned state
pub fn parse_particle_config_document(
    registry: &ParticleFormatRegistry,
    text: &str,
    options: Option<&ParseParticleConfigOptions>,
) -> ParticleConfigParseResult {
    let Some(format) = detect_particle_format(registry, text) else {
        let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
        report_import_diagnostic(
            Some(&mut diagnostics),
            ImportDiagnosticSeverity::Reject,
            "particles.unknown-format",
            "parseParticleConfigDocument",
            Some(string_detail("reason", "no-format-detected")),
        );
        return ParticleConfigParseResult {
            config: default_config(),
            diagnostics,
            format: None,
        };
    };
    let Some(codec) = get_particle_format_codec(registry, &format) else {
        let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
        report_import_diagnostic(
            Some(&mut diagnostics),
            ImportDiagnosticSeverity::Reject,
            "particles.unknown-format",
            "parseParticleConfigDocument",
            Some(string_detail("reason", "no-registered-parser")),
        );
        return ParticleConfigParseResult {
            config: default_config(),
            diagnostics,
            format: Some(format),
        };
    };
    return match catch_unwind(AssertUnwindSafe(|| {
        (codec.parse_to_document)(text, options)
    })) {
        Ok(result) => ParticleConfigParseResult {
            config: result.config,
            diagnostics: result.diagnostics,
            format: Some(format),
        },
        Err(payload) => {
            let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
            report_import_diagnostic(
                Some(&mut diagnostics),
                ImportDiagnosticSeverity::Reject,
                "particles.parse-error",
                "parseParticleConfigDocument",
                Some(string_detail("message", &panic_message(payload))),
            );
            ParticleConfigParseResult {
                config: default_config(),
                diagnostics,
                format: Some(format),
            }
        }
    };
}
