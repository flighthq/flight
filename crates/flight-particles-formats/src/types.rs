//! Shared particle-format declarations (TS `types/src/ParticleFormat*.ts`, `ParticleConfigParse.ts`,
//! `ParticleSerializeResult.ts`, `ParticleFormatKind.ts`).

use std::sync::Arc;

use flight_importdiagnostics::ImportDiagnostic;
use flight_particles::ParticleEmitterConfig;

/// The requirement-key namespace for this format family (TS `PARTICLES_REQUIREMENT_KEY_NAMESPACE`).
pub const PARTICLES_REQUIREMENT_KEY_NAMESPACE: &str = "particles";

pub const PARTICLE_DESIGNER_FORMAT_KIND: &str = "ParticleDesigner";
pub const SPINE_PARTICLE_FORMAT_KIND: &str = "Spine";
pub const UNITY_PARTICLE_FORMAT_KIND: &str = "Unity";
pub const LIBGDX_PARTICLE_FORMAT_KIND: &str = "Libgdx";
pub const STARLING_PEX_FORMAT_KIND: &str = "StarlingPex";
pub const PIXI_PARTICLE_FORMAT_KIND: &str = "Pixi";

/// Open format-kind string (TS `ParticleFormatKind`: the built-in constants plus vendor kinds).
pub type ParticleFormatKind = String;

/// Options a caller can pass to any registered parse (TS `ParseParticleConfigOptions`, the union of
/// the per-format parse options).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ParseParticleConfigOptions {
    /// Unity pixels-per-unit conversion; defaults to 100.
    pub pixels_per_unit: Option<f32>,
    /// Particle texture side length used to normalize pixel sizes; defaults to 1.
    pub texture_size: Option<f32>,
}

/// The config plus structured diagnostics a codec produces (TS `{ config, diagnostics }`).
pub struct ParticleFormatParseDocumentResult {
    pub config: ParticleEmitterConfig,
    pub diagnostics: Vec<ImportDiagnostic>,
}

/// The result of parsing any supported format (TS `ParticleConfigParseResult`).
pub struct ParticleConfigParseResult {
    pub config: ParticleEmitterConfig,
    pub diagnostics: Vec<ImportDiagnostic>,
    /// The detected format kind, or `None` when no format matched.
    pub format: Option<ParticleFormatKind>,
}

/// The result of a particle-format serialize operation (TS `ParticleSerializeResult`).
pub struct ParticleSerializeResult {
    pub text: String,
    pub warnings: Vec<String>,
}

/// A warning emitted during a parse or serialize pass (TS `ParticleFormatWarning`).
pub struct ParticleFormatWarning {
    pub code: String,
    pub format: ParticleFormatKind,
    pub message: String,
}

/// A registered format codec (TS `ParticleFormatCodec`); its callbacks are the format's detect,
/// parse and optional serialize entry points.
#[derive(Clone)]
pub struct ParticleFormatCodec {
    pub detect: Arc<dyn Fn(&str) -> bool + Send + Sync>,
    pub parse_to_config: Arc<
        dyn Fn(&str, Option<&ParseParticleConfigOptions>) -> ParticleEmitterConfig + Send + Sync,
    >,
    pub parse_to_document: Arc<
        dyn Fn(&str, Option<&ParseParticleConfigOptions>) -> ParticleFormatParseDocumentResult
            + Send
            + Sync,
    >,
    pub serialize:
        Option<Arc<dyn Fn(&ParticleEmitterConfig) -> ParticleSerializeResult + Send + Sync>>,
}

/// One particle format as a single value: the kind it registers under and the codec that reads it
/// (TS `ParticleFormatDescriptor`).
#[derive(Clone)]
pub struct ParticleFormatDescriptor {
    pub codec: Arc<ParticleFormatCodec>,
    pub kind: ParticleFormatKind,
}

/// Which particle formats an import installs, in the order they are consulted (TS
/// `ParticleImportOptions`). Omitting `formats` installs nothing.
#[derive(Default)]
pub struct ParticleImportOptions {
    pub formats: Option<Vec<ParticleFormatDescriptor>>,
}
