//! Format sniffing (TS `detect.ts`): detection is provided solely by the registered codecs.

use crate::format_registry::{ParticleFormatRegistry, detect_registered_particle_format};
use crate::types::*;

/// Sniffs the text and returns the registered format kind, or `None` when no registered codec
/// recognises it. Never throws (TS `detectParticleFormat`).
// flight-lint: allow(conform-params) D5: the source's module registry is explicit caller-owned state
pub fn detect_particle_format(
    registry: &ParticleFormatRegistry,
    text: &str,
) -> Option<ParticleFormatKind> {
    return detect_registered_particle_format(registry, text);
}
