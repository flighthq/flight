//! Opt-in diagnostics for the effect-chain sentinels that are indistinguishable from working code
//! (TS `enableWgpuEffectGuards.ts`): an unregistered chain returns `false` having never written
//! `dest`, and a partially registered chain succeeds while silently dropping the effects it could
//! not run. Both are correct by contract and neither surfaces anywhere without these guards.

use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_render_wgpu::WgpuRenderState;

use crate::types::*;
use crate::wgpu_effect_runtime::{
    format_wgpu_effect_number, get_wgpu_effect_runtime, peek_wgpu_effect_runtime,
};
use crate::wgpu_effect_state::{
    set_wgpu_effect_state_sample_count_guard, set_wgpu_effect_state_skip_guard,
};
use crate::wgpu_render_texture_effect::{
    get_wgpu_effect_application_status_string, set_wgpu_effect_application_guard,
};

/// Whether the effect diagnostics are installed for this state (TS `areWgpuEffectGuardsEnabled`).
pub fn are_wgpu_effect_guards_enabled(state: &WgpuRenderState) -> bool {
    return peek_wgpu_effect_runtime(state).is_some_and(|runtime| runtime.guards_enabled);
}

/// Removes the effect diagnostics, leaving the silent sentinels silent again (TS
/// `disableWgpuEffectGuards`).
pub fn disable_wgpu_effect_guards(state: &mut WgpuRenderState) {
    set_wgpu_effect_application_guard(state, None);
    set_wgpu_effect_state_sample_count_guard(state, None);
    set_wgpu_effect_state_skip_guard(state, None);
    get_wgpu_effect_runtime(state).guards_enabled = false;
}

/// Installs once-per-observation warnings for failed render-texture applications, dropped
/// pipeline effects and substituted sample counts (TS `enableWgpuEffectGuards`). The warnings go
/// to `log_state`; with `None` the guards are installed but report nowhere.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the TS logging singleton
pub fn enable_wgpu_effect_guards(state: &mut WgpuRenderState, log_state: Option<LogStateRef>) {
    let application_log = log_state.clone();
    set_wgpu_effect_application_guard(
        state,
        Some(Arc::new(
            move |_state: &WgpuRenderState, explanation: &WgpuEffectApplicationExplanation| {
                if let Some(log_state) = &application_log {
                    warn_wgpu_effect_application(log_state, explanation);
                }
            },
        )),
    );
    let sample_count_log = log_state.clone();
    set_wgpu_effect_state_sample_count_guard(
        state,
        Some(Arc::new(
            move |_state: &WgpuRenderState, requested: f32, applied: f32| {
                if let Some(log_state) = &sample_count_log {
                    warn_wgpu_effect_state_sample_count(log_state, requested, applied);
                }
            },
        )),
    );
    let skip_log = log_state;
    set_wgpu_effect_state_skip_guard(
        state,
        Some(Arc::new(move |_state: &WgpuRenderState, kind: &str| {
            if let Some(log_state) = &skip_log {
                warn_wgpu_effect_state_skip(log_state, kind);
            }
        })),
    );
    get_wgpu_effect_runtime(state).guards_enabled = true;
}

fn get_wgpu_effect_application_message(explanation: &WgpuEffectApplicationExplanation) -> String {
    let unregistered = explanation.unregistered_kinds.join(", ");
    let unresolved: Vec<String> = explanation
        .unresolved_indexes
        .iter()
        .map(|index| index.to_string())
        .collect();
    let unresolved = unresolved.join(", ");
    return match explanation.status {
        WgpuEffectApplicationStatus::PartialRegistration => format!(
            "applyWgpuEffectsToRenderTexture: {} of {} effect kinds have no registered runner and were SKIPPED — the destination was written without them; call registerWgpuEffect(state, kind, runner) for {}",
            explanation.unregistered_kinds.len(),
            explanation.requested_count,
            unregistered
        ),
        WgpuEffectApplicationStatus::SourceUnavailable => "applyWgpuEffectsToRenderTexture: the source render Texture has no realized WGPU target, so the call returned false and the destination was NOT written — render into the source before applying effects".to_string(),
        WgpuEffectApplicationStatus::PartialResolution => format!(
            "applyWgpuEffectsToRenderTexture: {} of {} effects have a runner but no resolved external resource, so those stages COPIED THE INPUT THROUGH UNCHANGED; chain position(s) {}",
            explanation.unresolved_indexes.len(),
            explanation.requested_count,
            unresolved
        ),
        WgpuEffectApplicationStatus::StaleDestination => "applyWgpuEffectsToRenderTexture: the call returned false before replacing the destination, so its previously published pixels are a STALE DESTINATION — handle the false return before sampling dest, and make the source and runners available before retrying".to_string(),
        WgpuEffectApplicationStatus::UnresolvedEffects => format!(
            "applyWgpuEffectsToRenderTexture: every registered effect was unresolved and COPIED THE INPUT THROUGH UNCHANGED; chain position(s) {unresolved}"
        ),
        _ => format!(
            "applyWgpuEffectsToRenderTexture: no registered runner for any of {unregistered}, so the call returned false and the destination was NEVER WRITTEN — anything sampling it reads a stale or empty texture; call registerWgpuEffect(state, kind, runner)"
        ),
    };
}

fn warn_wgpu_effect_application(
    log_state: &LogStateRef,
    explanation: &WgpuEffectApplicationExplanation,
) {
    // Keyed by status plus the kinds involved: a chain missing a different effect is a different
    // observation worth reporting, while the same miss every frame is not.
    let unresolved: Vec<String> = explanation
        .unresolved_indexes
        .iter()
        .map(|index| index.to_string())
        .collect();
    let key = format!(
        "effects-wgpu:effect-application:{}:{}:{}",
        get_wgpu_effect_application_status_string(explanation.status),
        explanation.unregistered_kinds.join(","),
        unresolved.join(",")
    );
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(get_wgpu_effect_application_message(explanation)),
    );
    data.insert(
        "registeredCount".to_string(),
        LogValue::Number((explanation.registered_count as i64) as f64),
    );
    data.insert(
        "requestedCount".to_string(),
        LogValue::Number((explanation.requested_count as i64) as f64),
    );
    data.insert(
        "status".to_string(),
        LogValue::Str(get_wgpu_effect_application_status_string(explanation.status).to_string()),
    );
    data.insert(
        "unregisteredKinds".to_string(),
        LogValue::Array(
            explanation
                .unregistered_kinds
                .iter()
                .map(|kind| LogValue::Str(kind.clone()))
                .collect(),
        ),
    );
    data.insert(
        "unresolvedIndexes".to_string(),
        LogValue::Array(
            explanation
                .unresolved_indexes
                .iter()
                .map(|index| LogValue::Number((*index as i64) as f64))
                .collect(),
        ),
    );
    log_once(
        log_state,
        0.0,
        &key,
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("effects-wgpu".to_string()),
    );
}

// WebGPU effect targets support one or four coverage samples. Other counts are substituted rather
// than rejected so module-scope pipeline construction stays loadable; the guard makes the applied
// count explicit. Warns once per requested count.
// flight-lint: allow(f64) LogValue::Float carries the JS-number log fields as f64
fn warn_wgpu_effect_state_sample_count(log_state: &LogStateRef, requested: f32, applied: f32) {
    let requested_text = format_wgpu_effect_number(requested);
    let applied_text = format_wgpu_effect_number(applied);
    let mut data = HashMap::new();
    data.insert(
        "appliedSampleCount".to_string(),
        LogValue::Number(applied as f64),
    );
    data.insert(
        "message".to_string(),
        LogValue::Str(format!(
            "createWgpuEffectState: sampleCount {requested_text} requested, but WGPU effect targets support 1 or 4 — continuing with sampleCount {applied_text}"
        )),
    );
    data.insert(
        "requestedSampleCount".to_string(),
        LogValue::Number(requested as f64),
    );
    log_once(
        log_state,
        0.0,
        &format!("effects-wgpu:pipeline-sample-count-substituted:{requested_text}"),
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("effects-wgpu".to_string()),
    );
}

// A pipeline pass drops an effect whose kind has no runner with a bare skip: no draw, no error, no
// artifact. Keyed by kind, not by frame: the same missing kind every frame is one observation.
fn warn_wgpu_effect_state_skip(log_state: &LogStateRef, kind: &str) {
    let mut data = HashMap::new();
    data.insert("kind".to_string(), LogValue::Str(kind.to_string()));
    data.insert(
        "message".to_string(),
        LogValue::Str(format!(
            "endWgpuEffectPass: effect kind \"{kind}\" has no registered runner, so the pass was SKIPPED — the frame was written without it and nothing else reports this; call registerWgpuEffect(state, \"{kind}\", runner), or check whether this kind has a runner on this backend at all"
        )),
    );
    log_once(
        log_state,
        0.0,
        &format!("effects-wgpu:pipeline-effect-skipped:{kind}"),
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("effects-wgpu".to_string()),
    );
}
