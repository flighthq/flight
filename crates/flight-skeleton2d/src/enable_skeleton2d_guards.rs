//! Opt-in diagnostic guards for the skeleton's silent behaviours (TS `enableSkeleton2DGuards.ts`).

use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, log_once};

use crate::skeleton2d_guards::*;
use crate::types::*;

/// Uninstalls both guards (TS `disableSkeleton2DGuards`).
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module-global slots
pub fn disable_skeleton_2d_guards(state: &mut Skeleton2DGuardState) {
    set_skeleton_2d_coerced_interpolation_guard(state, None);
    set_skeleton_2d_deform_length_guard(state, None);
}

/// Installs the caller-facing skeleton guards (TS `enableSkeleton2DGuards`). The source's module
/// globals become caller-owned state plus the injected log state and clock (D5).
// flight-lint: allow(conform-params) D5: caller-owned guard state plus injected LogState and clock replace module globals
// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
pub fn enable_skeleton_2d_guards(
    state: &mut Skeleton2DGuardState,
    log_state: &LogStateRef,
    now_ms: f64,
) {
    let log = log_state.clone();
    set_skeleton_2d_coerced_interpolation_guard(
        state,
        Some(Arc::new(move |report: &Skeleton2DCoercedInterpolation| {
            warn_on_coerced_interpolation(&log, now_ms, report);
        })),
    );
    let log = log_state.clone();
    set_skeleton_2d_deform_length_guard(
        state,
        Some(Arc::new(move |report: &Skeleton2DDeformLengthMismatch| {
            warn_on_deform_length_mismatch(&log, now_ms, report);
        })),
    );
}

// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
fn warn_on_coerced_interpolation(
    log_state: &LogStateRef,
    now_ms: f64,
    report: &Skeleton2DCoercedInterpolation,
) {
    let key = format!("skeleton2d:coerced-interpolation:{}", report.subject);
    let message = format!(
        "A {} channel states '{}' interpolation but is walked as '{}'. The value it carries cannot be blended — an attachment index between two table entries names art nobody authored, and a draw order between two orderings gives fractional sort keys — so the step is forced and the stated easing has no effect. Author the track as '{}' to say what actually happens, or drive a blendable property instead.",
        report.subject, report.stated, report.applied, report.applied
    );
    let mut data = std::collections::HashMap::new();
    data.insert(String::from("message"), flight_log::LogValue::Str(message));
    let _ = log_once(
        log_state,
        now_ms,
        &key,
        LogLevel::Warn,
        LogData::Record(data).into(),
        Some(String::from("skeleton2d")),
    );
}

// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
fn warn_on_deform_length_mismatch(
    log_state: &LogStateRef,
    now_ms: f64,
    report: &Skeleton2DDeformLengthMismatch,
) {
    let key = format!("skeleton2d:deform-length:{}", report.subject);
    let message = format!(
        "Deform offsets on '{}' carry {} values but the vertex stream they address needs {}. The offsets are ignored rather than partly applied: a stream of the wrong length has no correct prefix, so consuming what fits would deform some vertices and silently leave the rest in their setup pose. Re-export the attachment, or check that the deform timeline belongs to this attachment.",
        report.subject, report.offsets, report.addressed
    );
    let mut data = std::collections::HashMap::new();
    data.insert(String::from("message"), flight_log::LogValue::Str(message));
    let _ = log_once(
        log_state,
        now_ms,
        &key,
        LogLevel::Warn,
        LogData::Record(data).into(),
        Some(String::from("skeleton2d")),
    );
}
