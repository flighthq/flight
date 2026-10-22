use std::sync::{Arc, RwLock};

use flight_effects::Effect;
use flight_effects_gl::contract::{GlEffectContext, apply_gl_effects_to_render_texture};
use flight_log::{
    LogData, LogEntry, LogStateRef, LogValue, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_render_gl::{GlRenderState, create_gl_render_texture_pool};

use crate::{lease_render_texture, make_effects, publish_render_texture};

fn noop_runner(_ctx: &mut GlEffectContext<'_>, _effect: &dyn Effect) -> Result<(), String> {
    return Ok(());
}

fn never_resolvable(_state: &mut GlRenderState, _effect: &dyn Effect) -> bool {
    return false;
}

fn apply_chain(state: &mut GlRenderState, kinds: &[&str], publish_destination: bool) -> bool {
    let mut pool = create_gl_render_texture_pool();
    let mut source = lease_render_texture(state, &mut pool, 8.0, 8.0);
    let mut dest = lease_render_texture(state, &mut pool, 8.0, 8.0);
    let mut scratch = lease_render_texture(state, &mut pool, 8.0, 8.0);
    publish_render_texture(state, &mut source);
    if publish_destination {
        publish_render_texture(state, &mut dest);
    }
    let effects = make_effects(kinds);
    return apply_gl_effects_to_render_texture(
        state,
        &mut pool,
        &source,
        &mut dest,
        &mut scratch,
        &effects,
    )
    .unwrap();
}

/// A fresh log state per test: `log_once` keys live on the log state, so no two tests share them.
fn create_log() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

fn capture_log(log: &LogStateRef, run: impl FnOnce()) -> Vec<LogEntry> {
    let sink = create_memory_log_sink(8);
    add_log_sink(log, sink.sink.clone());
    run();
    let mut entries = Vec::new();
    get_memory_log_sink_entries(&mut entries, &sink);
    flight_log::remove_log_sink(log, &sink.sink);
    return entries;
}

fn message_of(entry: &LogEntry) -> String {
    return match &entry.data {
        LogData::Message(message) => message.clone(),
        LogData::Record(record) => match record.get("message") {
            Some(LogValue::Str(message)) => message.clone(),
            _ => String::new(),
        },
    };
}

mod are_gl_effect_guards_enabled {
    use flight_effects_gl::contract::{
        are_gl_effect_guards_enabled, disable_gl_effect_guards, enable_gl_effect_guards,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn reports_whether_diagnostics_were_installed_for_the_state() {
        let state = make_state();
        assert!(!are_gl_effect_guards_enabled(&state));
        enable_gl_effect_guards(&state, None);
        assert!(are_gl_effect_guards_enabled(&state));
        disable_gl_effect_guards(&state);
        assert!(!are_gl_effect_guards_enabled(&state));
    }
}

mod disable_gl_effect_guards {
    use flight_effects_gl::contract::{disable_gl_effect_guards, enable_gl_effect_guards};

    use super::*;
    use crate::gl_test_helper::make_state;

    #[test]
    fn stops_reporting_leaving_the_silent_sentinel_silent_again() {
        let mut state = make_state();
        let log = create_log();
        enable_gl_effect_guards(&state, Some(log.clone()));
        disable_gl_effect_guards(&state);
        let entries = capture_log(&log, || {
            assert!(!apply_chain(&mut state, &["test.disabled-kind"], false));
        });
        assert!(entries.is_empty());
    }
}

mod enable_gl_effect_guards {
    use flight_effects_gl::contract::{
        EffectOperation, begin_gl_effect_pass, disable_gl_effect_guards, enable_gl_effect_guards,
        end_gl_effect_pass, register_gl_custom_shader_source, register_gl_effect,
    };

    use super::*;
    use crate::gl_test_helper::make_state;
    use crate::{make_effect, make_pipeline};

    #[test]
    fn warns_that_an_unregistered_chain_returned_false_without_writing_dest_then_stays_quiet() {
        let mut state = make_state();
        let log = create_log();
        enable_gl_effect_guards(&state, Some(log.clone()));
        let entries = capture_log(&log, || {
            assert!(!apply_chain(&mut state, &["test.unregistered-a"], false));
        });
        assert_eq!(entries.len(), 1);
        assert!(message_of(&entries[0]).contains("NEVER WRITTEN"));
        assert!(message_of(&entries[0]).contains("registerGlEffect"));
        let repeat = capture_log(&log, || {
            assert!(!apply_chain(&mut state, &["test.unregistered-a"], false));
        });
        assert!(repeat.is_empty());
    }

    #[test]
    fn warns_that_a_partially_registered_chain_silently_dropped_the_effects_it_could_not_run() {
        let mut state = make_state();
        let log = create_log();
        register_gl_effect(&mut state, "test.registered-b", noop_runner, None);
        enable_gl_effect_guards(&state, Some(log.clone()));
        let entries = capture_log(&log, || {
            assert!(apply_chain(
                &mut state,
                &["test.registered-b", "test.unregistered-b"],
                false
            ));
        });
        assert_eq!(entries.len(), 1);
        assert!(message_of(&entries[0]).contains("SKIPPED"));
        assert!(message_of(&entries[0]).contains("test.unregistered-b"));
    }

    #[test]
    fn warns_when_a_failed_chain_leaves_a_previously_published_destination_stale() {
        let mut state = make_state();
        let log = create_log();
        enable_gl_effect_guards(&state, Some(log.clone()));
        let entries = capture_log(&log, || {
            assert!(!apply_chain(&mut state, &["test.stale-destination"], true));
        });
        assert_eq!(entries.len(), 1);
        assert!(message_of(&entries[0]).contains("STALE DESTINATION"));
        assert!(message_of(&entries[0]).contains("handle the false return"));
    }

    #[test]
    fn warns_that_re_registered_shader_source_will_not_run_because_the_program_is_cached_by_key() {
        let mut state = make_state();
        let log = create_log();
        enable_gl_effect_guards(&state, Some(log.clone()));
        let entries = capture_log(&log, || {
            register_gl_custom_shader_source(
                &mut state,
                "test.reregistered-a",
                "void main() { o_color = vec4(1.0); }",
            );
            register_gl_custom_shader_source(
                &mut state,
                "test.reregistered-a",
                "void main() { o_color = vec4(0.0); }",
            );
        });
        assert_eq!(entries.len(), 1);
        assert!(message_of(&entries[0]).contains("will NOT run"));
        assert!(message_of(&entries[0]).contains("test.reregistered-a"));

        disable_gl_effect_guards(&state);
        let after_disable = capture_log(&log, || {
            register_gl_custom_shader_source(
                &mut state,
                "test.reregistered-b",
                "void main() { o_color = vec4(1.0); }",
            );
            register_gl_custom_shader_source(
                &mut state,
                "test.reregistered-b",
                "void main() { o_color = vec4(0.0); }",
            );
        });
        assert!(after_disable.is_empty());
    }

    #[test]
    fn warns_that_an_unresolvable_effect_copied_through_rather_than_being_dropped() {
        let mut state = make_state();
        let log = create_log();
        register_gl_effect(
            &mut state,
            "test.unresolved-a",
            noop_runner,
            Some(never_resolvable),
        );
        enable_gl_effect_guards(&state, Some(log.clone()));
        let entries = capture_log(&log, || {
            assert!(apply_chain(&mut state, &["test.unresolved-a"], false));
        });
        assert_eq!(entries.len(), 1);
        assert!(message_of(&entries[0]).contains("COPIED THE INPUT THROUGH UNCHANGED"));
        assert!(!message_of(&entries[0]).contains("SKIPPED"));
    }

    #[test]
    fn warns_that_a_pipeline_pass_dropped_an_effect_kind_with_no_runner_once_per_kind() {
        let mut state = make_state();
        let log = create_log();
        enable_gl_effect_guards(&state, Some(log.clone()));
        let mut pipeline = make_pipeline(&state);
        let operations = vec![EffectOperation::Effect(make_effect(
            "test.pipeline-dropped-kind",
        ))];
        let entries = capture_log(&log, || {
            let pass = begin_gl_effect_pass(&mut state, &mut pipeline, None, None).unwrap();
            end_gl_effect_pass(&mut state, &pass, &mut pipeline, &operations).unwrap();
        });
        assert_eq!(entries.len(), 1);
        assert!(message_of(&entries[0]).contains("test.pipeline-dropped-kind"));
        assert!(message_of(&entries[0]).contains("SKIPPED"));
        let again = capture_log(&log, || {
            let pass = begin_gl_effect_pass(&mut state, &mut pipeline, None, None).unwrap();
            end_gl_effect_pass(&mut state, &pass, &mut pipeline, &operations).unwrap();
        });
        assert!(again.is_empty());
    }

    #[test]
    fn stays_silent_for_an_empty_chain_which_is_a_no_op_the_caller_asked_for_rather_than_a_miss() {
        let mut state = make_state();
        let log = create_log();
        enable_gl_effect_guards(&state, Some(log.clone()));
        let entries = capture_log(&log, || {
            assert!(!apply_chain(&mut state, &[], false));
        });
        assert!(entries.is_empty());
    }

    #[test]
    fn stays_silent_when_every_requested_effect_has_a_runner() {
        let mut state = make_state();
        let log = create_log();
        register_gl_effect(&mut state, "test.registered-c", noop_runner, None);
        enable_gl_effect_guards(&state, Some(log.clone()));
        let entries = capture_log(&log, || {
            assert!(apply_chain(&mut state, &["test.registered-c"], false));
        });
        assert!(entries.is_empty());
    }
}
