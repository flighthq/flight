use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogEntry, LogStateRef, LogValue, MemoryLogSink, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;

use crate::support::*;

fn log_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

fn sink_entries(sink: &MemoryLogSink) -> Vec<LogEntry> {
    let mut out = Vec::new();
    get_memory_log_sink_entries(&mut out, sink);
    return out;
}

fn ct() -> WgpuColorScaleBiasInput {
    return WgpuColorScaleBiasInput::ColorScaleBias(create_test_color_scale_bias(
        0.5, 0.5, 0.5, 1.0, 0.0, 0.0, 0.0, 0.0,
    ));
}

mod are_wgpu_color_adjustment_guards_enabled {
    use super::*;

    #[test]
    fn reports_false_until_guards_are_installed_then_true() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(!are_wgpu_color_adjustment_guards_enabled(&state));
        enable_wgpu_color_adjustment_guards(&mut state, None);
        assert!(are_wgpu_color_adjustment_guards_enabled(&state));
        let guard = get_wgpu_color_adjustment_material_feature_guard(&state).unwrap();
        enable_wgpu_color_adjustment_guards(&mut state, None);
        assert!(std::ptr::fn_addr_eq(
            get_wgpu_color_adjustment_material_feature_guard(&state).unwrap(),
            guard
        ));
    }
}

mod enable_wgpu_color_adjustment_guards {
    use super::*;

    #[test]
    fn warns_once_when_a_color_adjustment_is_recorded_but_color_adjustment_was_never_enabled() {
        let mut state = create_wgpu_render_state_for_test(None);
        let logs = log_state();
        let sink = create_memory_log_sink(8);
        add_log_sink(&logs, sink.sink.clone());
        enable_wgpu_color_adjustment_guards(&mut state, Some(logs));
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&ct()), 0);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&ct()), 1);
        let entries = sink_entries(&sink);
        assert_eq!(entries.len(), 1);
        let LogData::Record(data) = &entries[0].data else {
            panic!("a record entry");
        };
        let Some(LogValue::Str(message)) = data.get("message") else {
            panic!("a message");
        };
        assert!(message.contains("registerWgpuColorAdjustmentMaterialFeature"));
    }

    #[test]
    fn stays_silent_for_an_untinted_instance() {
        let mut state = create_wgpu_render_state_for_test(None);
        let logs = log_state();
        let sink = create_memory_log_sink(8);
        add_log_sink(&logs, sink.sink.clone());
        enable_wgpu_color_adjustment_guards(&mut state, Some(logs));
        record_wgpu_quad_batch_color_scale_bias(&mut state, None, 0);
        assert_eq!(sink_entries(&sink).len(), 0);
    }

    #[test]
    fn does_not_warn_when_the_guard_slot_is_present_but_color_adjustment_is_also_enabled() {
        let mut state = create_wgpu_render_state_for_test(None);
        let logs = log_state();
        let sink = create_memory_log_sink(8);
        add_log_sink(&logs, sink.sink.clone());
        enable_wgpu_color_adjustment_guards(&mut state, Some(logs));
        register_wgpu_color_adjustment_material_feature(&mut state);
        record_wgpu_quad_batch_color_scale_bias(&mut state, Some(&ct()), 0);
        assert_eq!(sink_entries(&sink).len(), 0);
    }
}
