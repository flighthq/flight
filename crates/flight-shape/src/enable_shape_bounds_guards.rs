//! Opt-in missing-command diagnostics (TS `enableShapeBoundsGuards.ts`) over caller-owned state.
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_node::contract::Node;

use crate::shape_bounds_registry::set_shape_bounds_guard;
use crate::types::*;

/// Whether the missing-command guard is installed (TS `areShapeBoundsGuardsEnabled`).
// flight-lint: allow(conform-params) D5: the caller-owned state replaces the source module flag
pub fn are_shape_bounds_guards_enabled(state: &ShapeBoundsStateRef) -> bool {
    return state.read().unwrap().guard.is_some();
}

/// Clears the missing-command guard (TS `disableShapeBoundsGuards`).
// flight-lint: allow(conform-params) D5: the caller-owned state replaces the source module flag
pub fn disable_shape_bounds_guards(state: &ShapeBoundsStateRef) {
    set_shape_bounds_guard(state, None);
}

/// Installs the missing-command guard with injected log state and time (TS
/// `enableShapeBoundsGuards`).
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn enable_shape_bounds_guards(
    state: &ShapeBoundsStateRef,
    log_state: &LogStateRef,
    now_ms: f64,
) {
    let log = log_state.clone();
    set_shape_bounds_guard(
        state,
        Some(Arc::new(
            move |_source: &dyn Node, mode: ShapeBoundsMode, key: &str| {
                warn_on_missing_shape_bounds_command(&log, now_ms, mode, key);
            },
        )),
    );
}

fn mode_string(mode: ShapeBoundsMode) -> &'static str {
    return match mode {
        ShapeBoundsMode::Fill => "fill",
        ShapeBoundsMode::Ink => "ink",
    };
}

// flight-lint: allow(f64) D1: the injected operation time is a millisecond timestamp
fn warn_on_missing_shape_bounds_command(
    log_state: &LogStateRef,
    now_ms: f64,
    mode: ShapeBoundsMode,
    missing_command_key: &str,
) {
    let key = format!(
        "shape:bounds-command-missing:{}:{}",
        mode_string(mode),
        missing_command_key
    );
    let mut record = HashMap::new();
    record.insert(
        String::from("message"),
        LogValue::Str(format!(
            "Shape bounds are incomplete because command '{}' has no registered bounds contribution. Register its CanvasShapeCommand with explicit fillBounds and strokeBounds, or call explainShapeBounds(shape, mode) to inspect every missing key.",
            missing_command_key
        )),
    );
    record.insert(
        String::from("missingCommandKey"),
        LogValue::Str(String::from(missing_command_key)),
    );
    record.insert(
        String::from("mode"),
        LogValue::Str(String::from(mode_string(mode))),
    );
    log_once(
        log_state,
        now_ms,
        &key,
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(record)),
        Some(String::from("shape")),
    );
}
