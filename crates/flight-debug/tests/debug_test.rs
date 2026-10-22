use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex};

use flight_debug::contract::*;
use flight_log::{
    LogLevel, add_log_sink, create_memory_log_sink, get_log_channel_level, get_log_level, log,
    set_log_channel_level, set_log_level,
};
use flight_render::{
    are_color_adjustment_guards_enabled, are_render_registries_guards_enabled, create_render_state,
};

use crate::support::*;

mod create_debug_state {
    use super::*;

    #[test]
    fn starts_with_no_session_and_no_registered_subsystem() {
        let (state, log_state) = states();
        assert!(!is_debug_enabled(&state));
        assert!(!unregister_debug_subsystem(&state, "render"));
        disable_debug(&state, &log_state);
        assert!(!is_debug_enabled(&state));
    }
}

mod disable_debug {
    use super::*;

    #[test]
    fn removes_the_installed_sink_so_a_later_log_does_not_reach_it() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(16);
        register_debug_subsystem(&state, "render", &hooks(&["render"], None, None));
        let mut opts = options(&memory.sink);
        opts.subsystems = subsystems(&["render"]);
        enable_debug(&state, &log_state, Some(&opts));

        log(
            &log_state,
            0.0,
            LogLevel::Debug,
            "before".into(),
            Some("render".to_string()),
        );
        assert_eq!(entries(&memory).len(), 1);

        disable_debug(&state, &log_state);
        log(
            &log_state,
            0.0,
            LogLevel::Debug,
            "after".into(),
            Some("render".to_string()),
        );
        assert_eq!(entries(&memory).len(), 1);
    }

    #[test]
    fn runs_each_enabled_subsystem_disable_guards_binding() {
        let (state, log_state) = states();
        let (disable_guards, disabled) = counted();
        register_debug_subsystem(&state, "render", &hooks(&[], None, Some(disable_guards)));
        let mut opts = options(&create_memory_log_sink(1).sink);
        opts.subsystems = subsystems(&["render"]);
        enable_debug(&state, &log_state, Some(&opts));

        assert_eq!(calls(&disabled), 0);
        disable_debug(&state, &log_state);
        assert_eq!(calls(&disabled), 1);
    }

    #[test]
    fn restores_the_global_level_and_clears_the_channel_overrides_it_raised() {
        let (state, log_state) = states();
        set_log_level(&log_state, LogLevel::Warn);
        register_debug_subsystem(&state, "render", &hooks(&["render"], None, None));
        let mut opts = options(&create_memory_log_sink(1).sink);
        opts.subsystems = subsystems(&["render"]);
        opts.level = Some(LogLevel::Verbose);
        enable_debug(&state, &log_state, Some(&opts));

        disable_debug(&state, &log_state);
        assert_eq!(get_log_level(&log_state), LogLevel::Warn);
        assert_eq!(get_log_channel_level(&log_state, "render"), None);
    }

    #[test]
    fn preserves_channel_overrides_the_caller_set_before_the_session() {
        let (state, log_state) = states();
        set_log_channel_level(&log_state, "unrelated", LogLevel::Error);
        register_debug_subsystem(&state, "render", &hooks(&["render"], None, None));
        let mut opts = options(&create_memory_log_sink(1).sink);
        opts.subsystems = subsystems(&["render"]);
        enable_debug(&state, &log_state, Some(&opts));

        assert_eq!(
            get_log_channel_level(&log_state, "render"),
            Some(LogLevel::Debug)
        );

        disable_debug(&state, &log_state);
        assert_eq!(get_log_channel_level(&log_state, "render"), None);
        assert_eq!(
            get_log_channel_level(&log_state, "unrelated"),
            Some(LogLevel::Error)
        );
    }

    #[test]
    fn restores_a_pre_existing_override_on_a_channel_debug_also_raised() {
        let (state, log_state) = states();
        set_log_channel_level(&log_state, "render", LogLevel::Warn);
        register_debug_subsystem(&state, "render", &hooks(&["render"], None, None));
        let mut opts = options(&create_memory_log_sink(1).sink);
        opts.subsystems = subsystems(&["render"]);
        opts.level = Some(LogLevel::Verbose);
        enable_debug(&state, &log_state, Some(&opts));

        assert_eq!(
            get_log_channel_level(&log_state, "render"),
            Some(LogLevel::Verbose)
        );

        disable_debug(&state, &log_state);
        assert_eq!(
            get_log_channel_level(&log_state, "render"),
            Some(LogLevel::Warn)
        );
    }

    #[test]
    fn is_a_no_op_when_debug_is_not_enabled() {
        let (state, log_state) = states();
        assert!(!is_debug_enabled(&state));
        disable_debug(&state, &log_state);
        assert!(!is_debug_enabled(&state));
    }
}

mod enable_debug {
    use super::*;

    #[test]
    fn runs_a_selected_subsystem_enable_guards_and_raises_its_channel_levels() {
        let (state, log_state) = states();
        let (enable_guards, enabled) = counted();
        register_debug_subsystem(
            &state,
            "render",
            &hooks(&["render", "render.batch"], Some(enable_guards), None),
        );
        let mut opts = options(&create_memory_log_sink(1).sink);
        opts.subsystems = subsystems(&["render"]);
        enable_debug(&state, &log_state, Some(&opts));

        assert_eq!(calls(&enabled), 1);
        assert_eq!(
            get_log_channel_level(&log_state, "render"),
            Some(LogLevel::Debug)
        );
        assert_eq!(
            get_log_channel_level(&log_state, "render.batch"),
            Some(LogLevel::Debug)
        );
        assert!(is_debug_enabled(&state));
    }

    #[test]
    fn routes_a_log_on_a_raised_channel_to_the_installed_sink() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(16);
        register_debug_subsystem(&state, "render", &hooks(&["render"], None, None));
        let mut opts = options(&memory.sink);
        opts.subsystems = subsystems(&["render"]);
        enable_debug(&state, &log_state, Some(&opts));

        log(
            &log_state,
            0.0,
            LogLevel::Debug,
            "draw".into(),
            Some("render".to_string()),
        );
        assert_eq!(entries(&memory).len(), 1);
    }

    #[test]
    fn honors_an_explicit_level_and_extra_channels() {
        let (state, log_state) = states();
        register_debug_subsystem(&state, "render", &hooks(&["render"], None, None));
        let mut opts = options(&create_memory_log_sink(1).sink);
        opts.subsystems = subsystems(&["render"]);
        opts.level = Some(LogLevel::Verbose);
        opts.channels = Some(vec!["app".to_string()]);
        enable_debug(&state, &log_state, Some(&opts));

        assert_eq!(get_log_level(&log_state), LogLevel::Verbose);
        assert_eq!(
            get_log_channel_level(&log_state, "render"),
            Some(LogLevel::Verbose)
        );
        assert_eq!(
            get_log_channel_level(&log_state, "app"),
            Some(LogLevel::Verbose)
        );
    }

    #[test]
    fn enables_every_registered_subsystem_when_none_are_named() {
        let (state, log_state) = states();
        let (render_guards, render) = counted();
        let (input_guards, input) = counted();
        register_debug_subsystem(&state, "render", &hooks(&[], Some(render_guards), None));
        register_debug_subsystem(&state, "input", &hooks(&[], Some(input_guards), None));

        enable_debug(
            &state,
            &log_state,
            Some(&options(&create_memory_log_sink(1).sink)),
        );

        assert_eq!(calls(&render), 1);
        assert_eq!(calls(&input), 1);
    }

    #[test]
    fn skips_an_unregistered_subsystem_name_without_throwing() {
        let (state, log_state) = states();
        let mut opts = options(&create_memory_log_sink(1).sink);
        opts.subsystems = subsystems(&["audio"]);
        enable_debug(&state, &log_state, Some(&opts));
        assert!(is_debug_enabled(&state));
    }

    #[test]
    fn is_idempotent_a_second_enable_while_active_does_not_re_run_guards_or_re_install() {
        let (state, log_state) = states();
        let (enable_guards, enabled) = counted();
        let memory = create_memory_log_sink(16);
        register_debug_subsystem(
            &state,
            "render",
            &hooks(&["render"], Some(enable_guards), None),
        );
        let mut opts = options(&memory.sink);
        opts.subsystems = subsystems(&["render"]);

        enable_debug(&state, &log_state, Some(&opts));
        enable_debug(&state, &log_state, Some(&opts));

        assert_eq!(calls(&enabled), 1);
        log(
            &log_state,
            0.0,
            LogLevel::Debug,
            "once".into(),
            Some("render".to_string()),
        );
        assert_eq!(entries(&memory).len(), 1);
    }

    #[test]
    fn installs_a_console_sink_by_default_and_disable_removes_exactly_that_sink() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(4);
        add_log_sink(&log_state, memory.sink.clone());
        enable_debug(&state, &log_state, None);
        assert_eq!(log_state.read().unwrap().sinks.len(), 2);
        log(&log_state, 0.0, LogLevel::Debug, "console".into(), None);
        assert_eq!(entries(&memory).len(), 1);
        disable_debug(&state, &log_state);
        let sinks = log_state.read().unwrap().sinks.clone();
        assert_eq!(sinks.len(), 1);
        assert!(Arc::ptr_eq(&sinks[0], &memory.sink));
    }

    #[test]
    fn unwinds_a_partially_enabled_guard_transaction_without_masking_its_original_error() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(16);
        let active: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let rollback_order: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let subsystem = |name: &str, fail_enable: bool, fail_rollback: bool| {
            let (on, off, order) = (active.clone(), active.clone(), rollback_order.clone());
            let (enable_name, disable_name) = (name.to_string(), name.to_string());
            let enable: DebugGuardBinding = Arc::new(move || {
                on.lock().unwrap().push(enable_name.clone());
                if fail_enable {
                    panic!("audio guard enable failed");
                }
            });
            let disable: DebugGuardBinding = Arc::new(move || {
                off.lock().unwrap().retain(|guard| *guard != disable_name);
                order.lock().unwrap().push(disable_name.clone());
                if fail_rollback {
                    panic!("input guard rollback failed");
                }
            });
            return hooks(&[name], Some(enable), Some(disable));
        };
        register_debug_subsystem(&state, "render", &subsystem("render", false, false));
        register_debug_subsystem(&state, "input", &subsystem("input", false, true));
        register_debug_subsystem(&state, "audio", &subsystem("audio", true, false));
        set_log_level(&log_state, LogLevel::Warn);
        set_log_channel_level(&log_state, "render", LogLevel::Error);
        set_log_channel_level(&log_state, "input", LogLevel::Info);
        set_log_channel_level(&log_state, "unrelated", LogLevel::Verbose);

        let mut opts = options(&memory.sink);
        opts.subsystems = subsystems(&["render", "input", "audio"]);
        let thrown = catch_unwind(AssertUnwindSafe(|| {
            enable_debug(&state, &log_state, Some(&opts))
        }))
        .unwrap_err();

        assert_eq!(
            thrown.downcast_ref::<&str>(),
            Some(&"audio guard enable failed")
        );
        assert!(!is_debug_enabled(&state));
        assert!(active.lock().unwrap().is_empty());
        assert_eq!(
            *rollback_order.lock().unwrap(),
            vec!["audio", "input", "render"]
        );
        assert_eq!(get_log_level(&log_state), LogLevel::Warn);
        assert_eq!(
            get_log_channel_level(&log_state, "render"),
            Some(LogLevel::Error)
        );
        assert_eq!(
            get_log_channel_level(&log_state, "input"),
            Some(LogLevel::Info)
        );
        assert_eq!(get_log_channel_level(&log_state, "audio"), None);
        assert_eq!(
            get_log_channel_level(&log_state, "unrelated"),
            Some(LogLevel::Verbose)
        );
        log(
            &log_state,
            0.0,
            LogLevel::Error,
            "after failed enable".into(),
            None,
        );
        assert!(entries(&memory).is_empty());
    }
}

mod enable_flight_diagnostics {
    use super::*;

    #[test]
    fn enables_the_console_diagnostics_session_and_every_generic_render_guard_for_the_state() {
        let (state, log_state) = states();
        let mut render_state = create_render_state();
        enable_flight_diagnostics(&state, &log_state, &mut render_state);
        assert!(is_debug_enabled(&state));
        assert_eq!(log_state.read().unwrap().sinks.len(), 1);
        assert!(are_color_adjustment_guards_enabled(&render_state));
        assert!(are_render_registries_guards_enabled(&render_state));
    }
}

mod initialize_debug_state {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_debug_state() {
        let (state, log_state) = states();
        register_debug_subsystem(&state, "render", &hooks(&["render"], None, None));
        enable_debug(
            &state,
            &log_state,
            Some(&options(&create_memory_log_sink(1).sink)),
        );
        initialize_debug_state(&mut state.write().unwrap());
        assert!(!is_debug_enabled(&state));
        assert!(!unregister_debug_subsystem(&state, "render"));
    }
}

mod is_debug_enabled {
    use super::*;

    #[test]
    fn reports_the_enable_disable_lifecycle() {
        let (state, log_state) = states();
        assert!(!is_debug_enabled(&state));
        enable_debug(
            &state,
            &log_state,
            Some(&options(&create_memory_log_sink(1).sink)),
        );
        assert!(is_debug_enabled(&state));
        disable_debug(&state, &log_state);
        assert!(!is_debug_enabled(&state));
    }
}

mod register_debug_subsystem {
    use super::*;

    #[test]
    fn drives_a_newly_registered_subsystem_through_enable_debug() {
        let (state, log_state) = states();
        let (enable_guards, enabled) = counted();
        register_debug_subsystem(
            &state,
            "acme.custom",
            &hooks(&["acme.custom"], Some(enable_guards), None),
        );
        let mut opts = options(&create_memory_log_sink(1).sink);
        opts.subsystems = subsystems(&["acme.custom"]);
        enable_debug(&state, &log_state, Some(&opts));

        assert_eq!(calls(&enabled), 1);
        assert_eq!(
            get_log_channel_level(&log_state, "acme.custom"),
            Some(LogLevel::Debug)
        );
    }

    #[test]
    fn is_last_write_wins_for_a_repeated_name() {
        let (state, log_state) = states();
        let (first, first_calls) = counted();
        let (second, second_calls) = counted();
        register_debug_subsystem(&state, "render", &hooks(&[], Some(first), None));
        register_debug_subsystem(&state, "render", &hooks(&[], Some(second), None));
        let mut opts = options(&create_memory_log_sink(1).sink);
        opts.subsystems = subsystems(&["render"]);
        enable_debug(&state, &log_state, Some(&opts));

        assert_eq!(calls(&first_calls), 0);
        assert_eq!(calls(&second_calls), 1);
    }
}

mod unregister_debug_subsystem {
    use super::*;

    #[test]
    fn returns_true_and_stops_the_subsystem_from_being_driven() {
        let (state, log_state) = states();
        let (enable_guards, enabled) = counted();
        register_debug_subsystem(&state, "render", &hooks(&[], Some(enable_guards), None));

        assert!(unregister_debug_subsystem(&state, "render"));
        let mut opts = options(&create_memory_log_sink(1).sink);
        opts.subsystems = subsystems(&["render"]);
        enable_debug(&state, &log_state, Some(&opts));
        assert_eq!(calls(&enabled), 0);
    }

    #[test]
    fn returns_false_for_a_name_that_was_never_registered() {
        let (state, _) = states();
        assert!(!unregister_debug_subsystem(&state, "audio"));
    }
}
