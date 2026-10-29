//! flight-compiler: nullable-options

use std::sync::{Arc, Mutex, RwLock};

use flight_entity::Ref;
use flight_flow::contract::*;
use flight_log::{LogState, add_log_sink, create_json_log_formatter, create_log_state};

fn guard_state() -> FlowGuardStateRef {
    let state = Arc::new(RwLock::new(FlowGuardState {
        enabled: false,
        transition_depth: 0,
        context: Some(FlowGuardContext {
            log_state: log_state(),
            clock: Arc::new(|| 0.0),
        }),
    }));
    disable_flow_guards(state.clone());
    return state;
}

fn log_state() -> Ref<LogState> {
    return Arc::new(RwLock::new(create_log_state()));
}

fn capture_formatted_entries(state: &Ref<LogState>) -> Arc<Mutex<Vec<String>>> {
    let entries: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let captured = entries.clone();
    let formatter = create_json_log_formatter(state);
    add_log_sink(
        state,
        Arc::new(move |entry| {
            captured.lock().unwrap().push(formatter(entry));
        }),
    );
    return entries;
}

fn plain(name: &str) -> Ref<FlowState> {
    return Arc::new(RwLock::new(FlowState {
        name: Some(name.to_string()),
        on_enter: None,
        on_exit: None,
        on_pause: None,
        on_resume: None,
        on_update: None,
        render_below: None,
        update_below: None,
    }));
}

mod disable_flow_guards {
    use super::*;

    #[test]
    fn is_idempotent() {
        let guards = guard_state();
        disable_flow_guards(guards.clone());
        disable_flow_guards(guards.clone());
        assert!(!guards.read().unwrap().enabled);
    }
}

mod enable_flow_guards {
    use super::*;

    #[test]
    fn toggles_the_opt_in_guard_and_captures_the_enable_time_context() {
        let guards = guard_state();
        let state = log_state();
        enable_flow_guards(guards.clone(), state.clone(), Arc::new(|| 0.0));
        assert!(guards.read().unwrap().enabled);
        assert!(guards.read().unwrap().context.is_some());
        disable_flow_guards(guards.clone());
        assert!(!guards.read().unwrap().enabled);
    }
}

mod get_flow_guard_kind_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_string_for_each_kind() {
        assert_eq!(
            get_flow_guard_kind_string(FlowGuardKind::DuplicateStatePush),
            "duplicate-state-push"
        );
        assert_eq!(
            get_flow_guard_kind_string(FlowGuardKind::TransitionDuringTransition),
            "transition-during-transition"
        );
    }
}

mod parse_flow_guard_kind {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings_and_returns_none_for_unknown_names() {
        assert_eq!(
            parse_flow_guard_kind("duplicate-state-push"),
            Some(FlowGuardKind::DuplicateStatePush)
        );
        assert_eq!(
            parse_flow_guard_kind("transition-during-transition"),
            Some(FlowGuardKind::TransitionDuringTransition)
        );
        assert_eq!(
            parse_flow_guard_kind("nope").unwrap_or(FlowGuardKind::DuplicateStatePush),
            FlowGuardKind::DuplicateStatePush
        );
    }
}

mod report_flow_guard {
    use super::*;

    #[test]
    fn logs_a_warn_entry_with_the_exact_kind_string_and_live_clock_time_when_enabled() {
        let guards = guard_state();
        let state = log_state();
        enable_flow_guards(guards.clone(), state.clone(), Arc::new(|| 42.0));
        let captured = capture_formatted_entries(&state);
        report_flow_guard(&guards, FlowGuardKind::DuplicateStatePush);
        let entries = captured.lock().unwrap();
        assert_eq!(entries.len(), 1);
        assert!(entries[0].contains("\"t\":42"));
        assert!(entries[0].contains("\"level\":\"warn\""));
        assert!(entries[0].contains("\"channel\":\"flow\""));
        assert!(entries[0].contains("\"kind\":\"duplicate-state-push\""));
    }

    #[test]
    fn is_a_no_op_when_guards_are_disabled() {
        let guards = guard_state();
        let state = log_state();
        let captured = capture_formatted_entries(&state);
        report_flow_guard(&guards, FlowGuardKind::TransitionDuringTransition);
        assert!(captured.lock().unwrap().is_empty());
    }

    #[test]
    fn transition_during_transition_is_reported_when_the_guard_depth_is_already_positive() {
        let guards = guard_state();
        let state = log_state();
        enable_flow_guards(guards.clone(), state.clone(), Arc::new(|| 3.0));
        guards.write().unwrap().transition_depth = 1;
        let captured = capture_formatted_entries(&state);
        let stack = create_flow_stack();
        push_flow_state(&stack, plain("A"), &guards);
        let entries = captured.lock().unwrap();
        assert_eq!(entries.len(), 1);
        assert!(entries[0].contains("\"t\":3"));
        assert!(entries[0].contains("\"kind\":\"transition-during-transition\""));
        assert_eq!(guards.read().unwrap().transition_depth, 1);
    }

    #[test]
    fn duplicate_state_push_is_reported_by_shared_state_identity() {
        let guards = guard_state();
        let state = log_state();
        enable_flow_guards(guards.clone(), state.clone(), Arc::new(|| 0.0));
        let captured = capture_formatted_entries(&state);
        let stack = create_flow_stack();
        let a = plain("A");
        push_flow_state(&stack, a.clone(), &guards);
        push_flow_state(&stack, a, &guards);
        let entries = captured.lock().unwrap();
        assert_eq!(entries.len(), 1);
        assert!(entries[0].contains("\"kind\":\"duplicate-state-push\""));
    }

    #[test]
    fn equal_but_distinct_states_are_not_a_duplicate() {
        let guards = guard_state();
        let state = log_state();
        enable_flow_guards(guards.clone(), state.clone(), Arc::new(|| 0.0));
        let captured = capture_formatted_entries(&state);
        let stack = create_flow_stack();
        push_flow_state(&stack, plain("A"), &guards);
        push_flow_state(&stack, plain("A"), &guards);
        assert!(captured.lock().unwrap().is_empty());
    }
}
