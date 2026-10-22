use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};
use flight_render_gl::{GlColorAdjustmentData, GlRenderState};
use flight_scene2d_gl::contract::*;

use crate::gl_test_helper::create_gl_state;

fn ct() -> GlColorAdjustmentData {
    return GlColorAdjustmentData::ColorScaleBias([0.5, 0.5, 0.5, 1.0, 0.0, 0.0, 0.0, 0.0]);
}

fn guarded_state() -> (GlRenderState, flight_log::MemoryLogSink) {
    let mut state = create_gl_state();
    let log_state = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(8);
    add_log_sink(&log_state, sink.sink.clone());
    enable_gl_color_adjustment_guards(&mut state, Some(log_state));
    return (state, sink);
}

fn messages(sink: &flight_log::MemoryLogSink) -> Vec<String> {
    let mut entries = Vec::new();
    get_memory_log_sink_entries(&mut entries, sink);
    return entries
        .iter()
        .map(|entry| match &entry.data {
            LogData::Message(message) => message.clone(),
            LogData::Record(data) => match data.get("message") {
                Some(LogValue::Str(message)) => message.clone(),
                _ => String::new(),
            },
        })
        .collect();
}

mod are_gl_color_adjustment_guards_enabled {
    use super::*;

    #[test]
    fn reports_false_until_guards_are_installed_then_true() {
        let mut state = create_gl_state();
        assert!(!are_gl_color_adjustment_guards_enabled(&state));
        enable_gl_color_adjustment_guards(&mut state, None);
        assert!(are_gl_color_adjustment_guards_enabled(&state));
        let guard = state.gl_registries.color_adjustment_feature_guard.unwrap();
        enable_gl_color_adjustment_guards(&mut state, None);
        assert!(std::ptr::fn_addr_eq(
            state.gl_registries.color_adjustment_feature_guard.unwrap(),
            guard
        ));
    }
}

mod enable_gl_color_adjustment_guards {
    use super::*;

    #[test]
    fn warns_once_when_a_color_adjustment_is_recorded_but_color_adjustment_was_never_enabled() {
        let (mut state, sink) = guarded_state();
        record_gl_quad_batch_color_scale_bias(&mut state, Some(&ct()), 0);
        let messages = messages(&sink);
        assert_eq!(messages.len(), 1);
        assert!(messages[0].contains("registerGlColorAdjustmentMaterialFeature"));
    }

    #[test]
    fn stays_silent_for_an_untinted_instance() {
        let (mut state, sink) = guarded_state();
        record_gl_quad_batch_color_scale_bias(&mut state, None, 0);
        assert!(messages(&sink).is_empty());
    }

    #[test]
    fn does_not_warn_when_the_guard_slot_is_present_but_color_adjustment_is_also_enabled() {
        let (mut state, sink) = guarded_state();
        register_gl_color_adjustment_material_feature(&mut state);
        record_gl_quad_batch_color_scale_bias(&mut state, Some(&ct()), 0);
        assert!(messages(&sink).is_empty());
    }
}
