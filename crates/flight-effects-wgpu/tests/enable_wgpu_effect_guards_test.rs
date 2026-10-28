use flight_effects::{Effect, EffectStateOptions};
use flight_effects_wgpu::contract::*;
use flight_log::{LogValue, MemoryLogSink, clear_log_once_keys};
use flight_render::RenderTargetDescriptor;
use flight_render_wgpu::*;

use crate::support::*;

fn noop_runner(_context: &mut WgpuEffectContext<'_>, _effect: &dyn Effect) {}

fn descriptor() -> RenderTargetDescriptor {
    return RenderTargetDescriptor {
        width: 8.0,
        height: 8.0,
        format: None,
        color_attachments: None,
        color_formats: None,
        sample_count: None,
        depth: None,
        color_space: None,
    };
}

fn apply_chain(state: &mut WgpuRenderState, kinds: &[&str]) -> bool {
    let mut pool = create_wgpu_render_texture_pool();
    let source = acquire_wgpu_render_texture(state, &mut pool, &descriptor());
    let dest = acquire_wgpu_render_texture(state, &mut pool, &descriptor());
    let scratch = acquire_wgpu_render_texture(state, &mut pool, &descriptor());
    // Realize the source so `source-unavailable` is not what is being measured here.
    write_wgpu_render_texture_target(state, &mut source.write().unwrap(), |_, _| {});
    let effects: Vec<flight_effects::EffectRef> =
        kinds.iter().map(|kind| create_test_effect(kind)).collect();
    return apply_wgpu_effects_to_render_texture(
        state,
        &mut pool,
        &source.read().unwrap(),
        &mut dest.write().unwrap(),
        &mut scratch.write().unwrap(),
        &effects,
    );
}

fn run_pipeline_chain(state: &mut WgpuRenderState, pipeline: &mut WgpuEffectState, kind: &str) {
    let chain = vec![WgpuEffectOperation::Effect(create_test_effect(kind))];
    let mut screen = begin_wgpu_screen_render_pass_for_test(state, 800, 600);
    let scene = begin_wgpu_effect_pass(&mut screen, pipeline, None, None);
    end_wgpu_effect_pass(scene, pipeline, &chain);
    end_wgpu_render_pass(screen);
}

fn entry_count(sink: &MemoryLogSink) -> usize {
    return test_log_entries(sink).len();
}

fn record_number(entry: &flight_log::LogEntry, key: &str) -> Option<f64> {
    let flight_log::LogData::Record(record) = &entry.data else {
        return None;
    };
    return match record.get(key) {
        Some(LogValue::Number(value)) => Some(*value),
        _ => None,
    };
}

fn with_sample_count(count: f32) -> EffectStateOptions {
    return EffectStateOptions {
        sample_count: Some(count),
        ..test_default()
    };
}

mod are_wgpu_effect_guards_enabled {
    use super::*;

    #[test]
    fn reports_whether_diagnostics_were_installed_for_the_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(!are_wgpu_effect_guards_enabled(&state));

        enable_wgpu_effect_guards(&mut state, None);
        assert!(are_wgpu_effect_guards_enabled(&state));

        disable_wgpu_effect_guards(&mut state);
        assert!(!are_wgpu_effect_guards_enabled(&state));
    }
}

mod disable_wgpu_effect_guards {
    use super::*;

    #[test]
    fn stops_reporting_leaving_the_silent_sentinel_silent_again() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (log_state, sink) = create_test_logger();
        enable_wgpu_effect_guards(&mut state, Some(log_state));
        disable_wgpu_effect_guards(&mut state);

        assert!(!apply_chain(&mut state, &["test.wgpu-disabled-kind"]));

        assert_eq!(entry_count(&sink), 0);
    }
}

mod enable_wgpu_effect_guards {
    use super::*;

    // log_once suppresses a key until the keys are cleared, so the fire and the silence are asserted
    // in one test, in order.
    #[test]
    fn warns_that_an_unregistered_chain_returned_false_without_writing_dest_then_stays_quiet() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (log_state, sink) = create_test_logger();
        clear_log_once_keys(&log_state);
        enable_wgpu_effect_guards(&mut state, Some(log_state));

        assert!(!apply_chain(&mut state, &["test.wgpu-unregistered-a"]));

        let entries = test_log_entries(&sink);
        assert_eq!(entries.len(), 1);
        assert!(test_log_message(&entries[0]).contains("NEVER WRITTEN"));
        assert!(test_log_message(&entries[0]).contains("registerWgpuEffect"));

        assert!(!apply_chain(&mut state, &["test.wgpu-unregistered-a"]));
        assert_eq!(entry_count(&sink), 1);
    }

    #[test]
    fn warns_that_a_partially_registered_chain_silently_dropped_the_effects_it_could_not_run() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (log_state, sink) = create_test_logger();
        enable_wgpu_effect_guards(&mut state, Some(log_state));
        register_wgpu_effect(&mut state, "test.wgpu-registered-b", noop_runner, None);

        assert!(apply_chain(
            &mut state,
            &["test.wgpu-registered-b", "test.wgpu-unregistered-b"]
        ));

        let entries = test_log_entries(&sink);
        assert_eq!(entries.len(), 1);
        assert!(test_log_message(&entries[0]).contains("SKIPPED"));
        assert!(test_log_message(&entries[0]).contains("test.wgpu-unregistered-b"));
    }

    // Once per KIND, not once per frame: a chain missing the same effect every frame is one
    // observation.
    #[test]
    fn warns_that_a_pipeline_pass_dropped_an_effect_kind_with_no_runner_once_per_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (log_state, sink) = create_test_logger();
        enable_wgpu_effect_guards(&mut state, Some(log_state));
        let mut pipeline = create_wgpu_effect_state(&state, None);

        run_pipeline_chain(&mut state, &mut pipeline, "test.wgpu-pipeline-dropped-kind");

        let entries = test_log_entries(&sink);
        assert_eq!(entries.len(), 1);
        assert!(test_log_message(&entries[0]).contains("test.wgpu-pipeline-dropped-kind"));
        assert!(test_log_message(&entries[0]).contains("SKIPPED"));

        run_pipeline_chain(&mut state, &mut pipeline, "test.wgpu-pipeline-dropped-kind");
        assert_eq!(entry_count(&sink), 1);
    }

    #[test]
    fn warns_once_when_an_unsupported_sample_count_is_substituted() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (log_state, sink) = create_test_logger();
        enable_wgpu_effect_guards(&mut state, Some(log_state));

        let pipeline = create_wgpu_effect_state(&state, Some(&with_sample_count(8.0)));
        create_wgpu_effect_state(&state, Some(&with_sample_count(8.0)));

        assert_eq!(pipeline.options.sample_count, Some(4.0));
        let entries = test_log_entries(&sink);
        assert_eq!(entries.len(), 1);
        let message = test_log_message(&entries[0]);
        assert!(message.contains("sampleCount 8 requested"));
        assert!(message.contains("effect targets support 1 or 4"));
        assert!(message.contains("continuing with sampleCount 4"));
        assert!(!message.contains("multisampling was NOT applied"));
        assert_eq!(record_number(&entries[0], "appliedSampleCount"), Some(4.0));
        assert_eq!(
            record_number(&entries[0], "requestedSampleCount"),
            Some(8.0)
        );
    }

    #[test]
    fn stays_silent_when_the_requested_sample_counts_are_supported() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (log_state, sink) = create_test_logger();
        enable_wgpu_effect_guards(&mut state, Some(log_state));

        assert_eq!(
            create_wgpu_effect_state(&state, Some(&with_sample_count(1.0)))
                .options
                .sample_count,
            Some(1.0)
        );
        assert_eq!(
            create_wgpu_effect_state(&state, Some(&with_sample_count(4.0)))
                .options
                .sample_count,
            Some(4.0)
        );

        assert_eq!(entry_count(&sink), 0);
    }

    #[test]
    fn stays_silent_for_an_empty_chain_which_is_a_no_op_the_caller_asked_for_rather_than_a_miss() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (log_state, sink) = create_test_logger();
        enable_wgpu_effect_guards(&mut state, Some(log_state));

        assert!(!apply_chain(&mut state, &[]));

        assert_eq!(entry_count(&sink), 0);
    }

    #[test]
    fn stays_silent_when_every_requested_effect_has_a_runner() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (log_state, sink) = create_test_logger();
        enable_wgpu_effect_guards(&mut state, Some(log_state));
        register_wgpu_effect(&mut state, "test.wgpu-registered-c", noop_runner, None);

        assert!(apply_chain(&mut state, &["test.wgpu-registered-c"]));

        assert_eq!(entry_count(&sink), 0);
    }
}
