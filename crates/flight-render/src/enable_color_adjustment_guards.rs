use std::collections::HashMap;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_node::NodeRef;

use crate::RenderState;

pub fn are_color_adjustment_guards_enabled<S: RenderState>(state: &S) -> bool {
    return state
        .render_registries()
        .color_adjustment_unsupported_guard
        .is_some();
}

// flight-lint: allow(conform-params) D5 caller-owned LogState replaces the TS logging singleton
pub fn enable_color_adjustment_guards<S: RenderState>(
    state: &mut S,
    log_state: Option<LogStateRef>,
) {
    state.render_runtime_mut().color_adjustment_guard_log = log_state;
    state
        .render_registries_mut()
        .color_adjustment_unsupported_guard = Some(warn_unsupported_color_adjustment::<S>);
}

fn warn_unsupported_color_adjustment<S: RenderState>(state: &mut S, _source: &NodeRef) {
    let Some(log_state) = state.render_runtime().color_adjustment_guard_log.clone() else {
        return;
    };
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(
            "enableColorAdjustments: a per-object color adjustment is not inline-able because it has no 4×5 matrix representation. Use an Effect pass for the unsupported operation."
                .to_string(),
        ),
    );
    log_once(
        &log_state,
        0.0,
        "render:unsupported-color-adjustment",
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("render".to_string()),
    );
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
