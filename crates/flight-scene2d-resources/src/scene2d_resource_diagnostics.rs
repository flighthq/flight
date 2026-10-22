use flight_audio::AudioResourceReference;
use flight_image::ImageResourceReference;
use flight_resource::ResourceResolutionState;

use crate::types::*;

fn audio_reference_state(reference: &AudioResourceReference) -> ResourceResolutionState {
    return match reference {
        AudioResourceReference::Embedded(value) => value.reference.read().unwrap().state,
        AudioResourceReference::External(value) => value.reference.read().unwrap().state,
    };
}

/// Writes document-wide coverage from live reference and slot state.
// flight-lint: allow(conform-params) D24 caller-owned aggregate output is cleared and filled instead of returned
pub fn explain_scene2d_resource_coverage(
    out: &mut Scene2DResourceCoverageExplanation,
    document: &Scene2DDocument,
) {
    let audio_resources = Scene2DResourceCoverageCount {
        resolved: document
            .audio_resources
            .iter()
            .filter(|reference| {
                audio_reference_state(reference) == ResourceResolutionState::Resolved
            })
            .count(),
        total: document.audio_resources.len(),
    };
    let image_resources = Scene2DResourceCoverageCount {
        resolved: document
            .image_resources
            .iter()
            .filter(|reference| {
                image_reference_state(reference) == ResourceResolutionState::Resolved
            })
            .count(),
        total: document.image_resources.len(),
    };
    let mut required_slots = Scene2DResourceCoverageCount::default();
    for slot in &document.slots {
        let slot = slot.read().unwrap();
        if !slot.required {
            continue;
        }
        required_slots.total += 1;
        if slot.content.is_some() {
            required_slots.resolved += 1;
        }
    }
    out.audio_resources = audio_resources;
    out.complete = audio_resources.resolved == audio_resources.total
        && image_resources.resolved == image_resources.total
        && required_slots.resolved == required_slots.total;
    out.image_resources = image_resources;
    out.required_slots = required_slots;
}

fn image_reference_state(reference: &ImageResourceReference) -> ResourceResolutionState {
    return match reference {
        ImageResourceReference::Embedded(value) => value.reference.read().unwrap().state,
        ImageResourceReference::External(value) => value.reference.read().unwrap().state,
    };
}

/// Routes an expected sentinel through the caller's installed hook only.
// flight-lint: allow(conform-params) D5 caller-owned guard state replaces the source module-global hook
pub fn report_scene2d_resource_failure(
    guard_state: &Scene2DResourceFailureGuardStateRef,
    notice: &Scene2DResourceFailureNotice,
) {
    let guard = guard_state.read().unwrap().guard.clone();
    if let Some(guard) = guard {
        guard(notice);
    }
}

/// Installs or clears the hook in explicit caller-owned state.
// flight-lint: allow(conform-params) D5 caller-owned guard state replaces the source module-global hook
pub fn set_scene2d_resource_failure_guard(
    guard_state: &Scene2DResourceFailureGuardStateRef,
    guard: Option<Scene2DResourceFailureGuard>,
) {
    guard_state.write().unwrap().guard = guard;
}
