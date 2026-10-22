use std::sync::{Arc, RwLock};

use flight_adjustments::{
    Adjustment, create_lookup_table_grade_adjustment, create_tint_adjustment,
};
use flight_log::{
    LogData, LogStateRef, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};
use flight_node::contract::AdjustmentRef;
use flight_node::{NodeRef, set_node_color_adjustments};
use flight_render::*;

use crate::support::display_node;

fn adjustment<T: Adjustment + 'static>(value: T) -> AdjustmentRef {
    let typed: Arc<RwLock<T>> = Arc::new(RwLock::new(value));
    return typed;
}

fn log_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

fn resolve(state: &mut BaseRenderState, data: &mut RenderProxy<BaseRenderState>) {
    let resolver = state.registries.color_adjustments.unwrap();
    resolver(state, data, None);
}

mod are_color_adjustment_guards_enabled {
    use super::*;

    #[test]
    fn color_adjustment_guards_report_installation_and_are_idempotent() {
        let mut state = create_render_state();
        assert!(!are_color_adjustment_guards_enabled(&state));
        enable_color_adjustment_guards(&mut state, None);
        assert!(are_color_adjustment_guards_enabled(&state));
        let first = state.registries.color_adjustment_unsupported_guard.unwrap();
        enable_color_adjustment_guards(&mut state, None);
        assert!(std::ptr::fn_addr_eq(
            state.registries.color_adjustment_unsupported_guard.unwrap(),
            first
        ));
    }
}

mod enable_color_adjustment_guards {
    use super::*;

    #[test]
    fn guards_warn_once_for_a_non_inlineable_adjustment() {
        let mut state = create_render_state();
        let logs = log_state();
        let sink = create_memory_log_sink(8);
        add_log_sink(&logs, sink.sink.clone());
        enable_color_adjustment_guards(&mut state, Some(logs));
        enable_color_adjustments(&mut state);
        let source: NodeRef = display_node();
        set_node_color_adjustments(
            &source,
            Some(Arc::new(RwLock::new(vec![adjustment(
                create_lookup_table_grade_adjustment(),
            )]))),
        );
        let mut data = create_render_proxy(&mut state, &source);
        resolve(&mut state, &mut data);
        resolve(&mut state, &mut data);

        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 1);
        let LogData::Record(data) = &entries[0].data else {
            panic!("guard entry should contain structured data");
        };
        let Some(LogValue::Str(message)) = data.get("message") else {
            panic!("guard entry should contain a message string");
        };
        assert!(message.contains("not inline-able"));
    }

    #[test]
    fn guards_stay_silent_for_an_affine_adjustment_stack() {
        let mut state = create_render_state();
        let logs = log_state();
        let sink = create_memory_log_sink(8);
        add_log_sink(&logs, sink.sink.clone());
        enable_color_adjustment_guards(&mut state, Some(logs));
        enable_color_adjustments(&mut state);
        let source: NodeRef = display_node();
        set_node_color_adjustments(
            &source,
            Some(Arc::new(RwLock::new(vec![adjustment(
                create_tint_adjustment(0x7fff_ffff),
            )]))),
        );
        let mut data = create_render_proxy(&mut state, &source);
        resolve(&mut state, &mut data);

        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert!(entries.is_empty());
    }
}
