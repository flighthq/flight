//! Diagnostics for the effect-chain sentinels that are indistinguishable from working code: an
//! unregistered chain returns false having never written `dest`, a partially registered chain
//! succeeds while silently dropping effects, re-registered shader source never reaches the GPU, and
//! a pipeline pass drops an unregistered kind with a bare `continue`. Core stays message-free; the
//! messages live here and flow through `log_once`.

use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};
use flight_render_gl::GlRenderState;

use crate::contract::{
    GlEffectApplicationExplanation, GlEffectApplicationStatus,
    get_gl_effect_application_status_string, set_gl_custom_shader_source_guard,
    set_gl_effect_application_guard, set_gl_effect_state_skip_guard,
};
use crate::gl_effect_support::with_gl_effect_state_runtime;

pub fn are_gl_effect_guards_enabled(state: &GlRenderState) -> bool {
    return with_gl_effect_state_runtime(state, |runtime| runtime.guards_enabled);
}

pub fn disable_gl_effect_guards(state: &GlRenderState) {
    set_gl_effect_application_guard(state, None);
    set_gl_custom_shader_source_guard(state, None);
    set_gl_effect_state_skip_guard(state, None);
    with_gl_effect_state_runtime(state, |runtime| runtime.guards_enabled = false);
}

/// Installs the three warning guards. Messages go to `log_state` through `log_once` (keyed so a
/// recurring observation warns once); with no log state the guards are installed but silent.
// flight-lint: allow(conform-params) D5 native logging state is caller-owned
pub fn enable_gl_effect_guards(state: &GlRenderState, log_state: Option<LogStateRef>) {
    let application_log = log_state.clone();
    set_gl_effect_application_guard(
        state,
        Some(Arc::new(move |_state, explanation| {
            warn_gl_effect_application(application_log.as_ref(), explanation);
        })),
    );
    let source_log = log_state.clone();
    set_gl_custom_shader_source_guard(
        state,
        Some(Arc::new(move |_state, shader_key, _previous, _next| {
            warn_gl_custom_shader_source_reregistered(source_log.as_ref(), shader_key);
        })),
    );
    let skip_log = log_state;
    set_gl_effect_state_skip_guard(
        state,
        Some(Arc::new(move |_state, kind| {
            warn_gl_effect_state_skip(skip_log.as_ref(), kind);
        })),
    );
    with_gl_effect_state_runtime(state, |runtime| runtime.guards_enabled = true);
}

fn get_gl_effect_application_message(explanation: &GlEffectApplicationExplanation) -> String {
    return match explanation.status {
        GlEffectApplicationStatus::PartialRegistration => format!(
            "applyGlEffectsToRenderTexture: {} of {} effect kinds have no registered runner and were SKIPPED — the destination was written without them; call registerGlEffect(state, kind, runner) for {}",
            explanation.unregistered_kinds.len(),
            explanation.requested_count,
            explanation.unregistered_kinds.join(", ")
        ),
        GlEffectApplicationStatus::SourceUnavailable => "applyGlEffectsToRenderTexture: the source render Texture has no realized GL target, so the call returned false and the destination was NOT written — render into the source before applying effects".to_string(),
        GlEffectApplicationStatus::PartialResolution => format!(
            "applyGlEffectsToRenderTexture: {} of {} effects have a runner but nothing to run with, so those stages COPIED THE INPUT THROUGH UNCHANGED — they were not dropped and the destination WAS written; chain position(s) {} name something unregistered, such as a shaderKey with no registerGlCustomShaderSource call",
            explanation.unresolved_indexes.len(),
            explanation.requested_count,
            join_indexes_with(&explanation.unresolved_indexes, ", ")
        ),
        GlEffectApplicationStatus::StaleDestination => "applyGlEffectsToRenderTexture: the call returned false before replacing the destination, so its previously published pixels are a STALE DESTINATION — handle the false return before sampling dest, and make the source and runners available before retrying".to_string(),
        GlEffectApplicationStatus::UnresolvedEffects => format!(
            "applyGlEffectsToRenderTexture: every effect has a runner but NONE can resolve what it names, so the whole chain COPIED THE INPUT THROUGH UNCHANGED — the call returned true and the destination WAS written, which looks like effects that did nothing rather than effects that failed; chain position(s) {} name something unregistered, such as a shaderKey with no registerGlCustomShaderSource call",
            join_indexes_with(&explanation.unresolved_indexes, ", ")
        ),
        _ => format!(
            "applyGlEffectsToRenderTexture: no registered runner for any of {}, so the call returned false and the destination was NEVER WRITTEN — anything sampling it reads a stale or empty texture; call registerGlEffect(state, kind, runner)",
            explanation.unregistered_kinds.join(", ")
        ),
    };
}

fn join_indexes(indexes: &[usize]) -> String {
    return join_indexes_with(indexes, ",");
}

fn join_indexes_with(indexes: &[usize], separator: &str) -> String {
    return indexes
        .iter()
        .map(|index| index.to_string())
        .collect::<Vec<_>>()
        .join(separator);
}

fn warn(log_state: Option<&LogStateRef>, key: &str, record: HashMap<String, LogValue>) {
    let Some(log_state) = log_state else {
        return;
    };
    log_once(
        log_state,
        0.0,
        key,
        LogLevel::Warn,
        LogData::Record(record).into(),
        Some("effects-gl".to_string()),
    );
}

/// Re-registering different source under a live shaderKey leaves the ALREADY-COMPILED program
/// running, because the program cache is keyed by shaderKey rather than by source.
fn warn_gl_custom_shader_source_reregistered(log_state: Option<&LogStateRef>, shader_key: &str) {
    let mut record = HashMap::new();
    record.insert(
        "message".to_string(),
        LogValue::Str(format!(
            "registerGlCustomShaderSource: shaderKey \"{shader_key}\" already held DIFFERENT source, and the compiled program is cached by key — the new source will NOT run and the effect keeps drawing with the old one; register edited source under a new key and point the effect at it"
        )),
    );
    record.insert(
        "shaderKey".to_string(),
        LogValue::Str(shader_key.to_string()),
    );
    warn(
        log_state,
        &format!("effects-gl:custom-shader-source-reregistered:{shader_key}"),
        record,
    );
}

fn warn_gl_effect_application(
    log_state: Option<&LogStateRef>,
    explanation: &GlEffectApplicationExplanation,
) {
    // Keyed by status plus the kinds involved: a chain missing a different effect is a different
    // observation worth reporting, while the same miss every frame is not.
    let status = get_gl_effect_application_status_string(explanation.status);
    let key = format!(
        "effects-gl:effect-application:{}:{}:{}",
        status,
        explanation.unregistered_kinds.join(","),
        join_indexes(&explanation.unresolved_indexes)
    );
    let mut record = HashMap::new();
    record.insert(
        "message".to_string(),
        LogValue::Str(get_gl_effect_application_message(explanation)),
    );
    record.insert(
        "registeredCount".to_string(),
        LogValue::Number((explanation.registered_count as i64) as f64),
    );
    record.insert(
        "requestedCount".to_string(),
        LogValue::Number((explanation.requested_count as i64) as f64),
    );
    record.insert("status".to_string(), LogValue::Str(status.to_string()));
    record.insert(
        "unregisteredKinds".to_string(),
        LogValue::Array(
            explanation
                .unregistered_kinds
                .iter()
                .map(|kind| LogValue::Str(kind.clone()))
                .collect(),
        ),
    );
    warn(log_state, &key, record);
}

/// A pipeline pass drops an effect whose kind has no runner with a bare `continue`: no draw, no
/// error, no artifact.
fn warn_gl_effect_state_skip(log_state: Option<&LogStateRef>, kind: &str) {
    let mut record = HashMap::new();
    record.insert("kind".to_string(), LogValue::Str(kind.to_string()));
    record.insert(
        "message".to_string(),
        LogValue::Str(format!(
            "endGlEffectPass: effect kind \"{kind}\" has no registered runner, so the pass was SKIPPED — the frame was written without it and nothing else reports this; call registerGlEffect(state, \"{kind}\", runner), or check whether this kind has a runner on this backend at all"
        )),
    );
    warn(
        log_state,
        &format!("effects-gl:pipeline-effect-skipped:{kind}"),
        record,
    );
}
