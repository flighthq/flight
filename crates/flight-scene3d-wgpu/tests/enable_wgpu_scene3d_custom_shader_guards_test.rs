use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogEntry, LogStateRef, LogValue, MemoryLogSink, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_materials::UniformValue;
use flight_materials::custom_shader_material::create_custom_shader_material;
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

fn log_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

fn messages(sink: &MemoryLogSink) -> Vec<String> {
    let mut out: Vec<LogEntry> = Vec::new();
    get_memory_log_sink_entries(&mut out, sink);
    return out
        .iter()
        .filter_map(|entry| match &entry.data {
            LogData::Record(data) => match data.get("message") {
                Some(LogValue::Str(message)) => Some(message.clone()),
                _ => None,
            },
            _ => None,
        })
        .collect();
}

mod are_wgpu_scene3d_custom_shader_guards_enabled {
    use super::*;

    #[test]
    fn reports_installation_state() {
        let mut test = make_wgpu_scene3d_state(None);
        assert!(!are_wgpu_scene3d_custom_shader_guards_enabled(
            &mut test.state
        ));
        enable_wgpu_scene3d_custom_shader_guards(&mut test.state, None);
        assert!(are_wgpu_scene3d_custom_shader_guards_enabled(
            &mut test.state
        ));
    }
}

mod enable_wgpu_scene3d_custom_shader_guards {
    use super::*;

    #[test]
    fn is_idempotent() {
        let mut test = make_wgpu_scene3d_state(None);
        enable_wgpu_scene3d_custom_shader_guards(&mut test.state, None);
        enable_wgpu_scene3d_custom_shader_guards(&mut test.state, None);
        assert!(are_wgpu_scene3d_custom_shader_guards_enabled(
            &mut test.state
        ));
    }
}

mod run_wgpu_custom_shader_guards {
    use super::*;

    #[test]
    fn warns_on_bad_vector_lengths_capacity_overflow_and_missing_reserved_bindings() {
        let mut test = make_wgpu_scene3d_state(None);
        let logs = log_state();
        let sink = create_memory_log_sink(16);
        add_log_sink(&logs, sink.sink.clone());
        enable_wgpu_scene3d_custom_shader_guards(&mut test.state, Some(logs));
        let mut uniforms = HashMap::new();
        for i in 0..33 {
            uniforms.insert(format!("value{}", i), UniformValue::Array(vec![i as f32]));
        }
        uniforms.insert(
            "invalid".to_string(),
            UniformValue::Array(vec![1.0, 2.0, 3.0, 4.0, 5.0]),
        );
        let mut material = create_custom_shader_material();
        material.shader_key = "guard-contract-test".to_string();
        material.textures = Some(vec![(
            "a".to_string(),
            Arc::new(RwLock::new(create_test_unbacked_texture())),
        )]);
        material.uniforms = Some(uniforms);

        run_wgpu_custom_shader_guards(
            &mut test.state,
            &material.shader_key.clone(),
            "@group(0) @binding(0) var<uniform> frame: vec4f;",
            &material,
        );

        let messages = messages(&sink);
        assert!(
            messages
                .iter()
                .any(|message| message.contains("1–4 components"))
        );
        assert!(messages.iter().any(|message| message.contains("32-vec4")));
        assert!(
            messages
                .iter()
                .any(|message| message.contains("@group(1) @binding(0)"))
        );
        assert!(
            messages
                .iter()
                .any(|message| message.contains("@group(3) @binding(1)"))
        );
        assert!(
            !messages
                .iter()
                .any(|message| message.contains("@group(0) @binding(0)"))
        );
    }

    #[test]
    fn does_nothing_until_enabled() {
        let mut test = make_wgpu_scene3d_state(None);
        let logs = log_state();
        let sink = create_memory_log_sink(2);
        add_log_sink(&logs, sink.sink.clone());
        // A destination alone does not install the guard: the run is gated on enablement.
        flight_scene3d_wgpu::contract::get_wgpu_scene3d_runtime(&mut test.state)
            .custom_shader_guard_log = Some(logs);
        run_wgpu_custom_shader_guards(
            &mut test.state,
            "disabled-guard-test",
            "",
            &create_custom_shader_material(),
        );
        assert!(messages(&sink).is_empty());
    }

    // Each guard owns its destination: re-enabling ANOTHER guard family with None must not silence
    // this one (Principal ruling: None silences only the guard it is passed to).
    #[test]
    fn keeps_reporting_after_another_guard_family_is_enabled_with_none() {
        let mut test = make_wgpu_scene3d_state(None);
        let logs = log_state();
        let sink = create_memory_log_sink(16);
        add_log_sink(&logs, sink.sink.clone());
        enable_wgpu_scene3d_custom_shader_guards(&mut test.state, Some(logs));
        enable_wgpu_scene3d_forward_light_selection_guards(&mut test.state, None);
        run_wgpu_custom_shader_guards(
            &mut test.state,
            "cross-family-guard-test",
            "",
            &create_custom_shader_material(),
        );
        assert!(!messages(&sink).is_empty());
    }

    #[test]
    fn stays_silent_after_its_own_enable_with_none_replaces_the_log() {
        let mut test = make_wgpu_scene3d_state(None);
        let logs = log_state();
        let sink = create_memory_log_sink(16);
        add_log_sink(&logs, sink.sink.clone());
        enable_wgpu_scene3d_custom_shader_guards(&mut test.state, Some(logs));
        enable_wgpu_scene3d_custom_shader_guards(&mut test.state, None);
        run_wgpu_custom_shader_guards(
            &mut test.state,
            "own-null-guard-test",
            "",
            &create_custom_shader_material(),
        );
        assert!(are_wgpu_scene3d_custom_shader_guards_enabled(
            &mut test.state
        ));
        assert!(messages(&sink).is_empty());
    }
}
