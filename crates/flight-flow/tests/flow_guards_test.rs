use std::sync::{Arc, RwLock};

use flight_flow::contract::report_flow_guard;
use flight_flow::*;
use flight_log::{
    add_log_sink, create_log_state, create_memory_log_sink, get_memory_log_sink_entries,
    remove_log_sink, LogData, LogLevel, LogStateRef, LogValue,
};

fn guard_state() -> FlowGuardStateRef {
    return Arc::new(RwLock::new(FlowGuardState {
        enabled: false,
        transition_depth: 0,
        context: None,
    }));
}

fn log_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

fn plain(name: &str) -> flight_entity::Ref<FlowState> {
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
        let state = log_state();
        disable_flow_guards(&guards);
        disable_flow_guards(&guards);
        assert!(!guards.read().unwrap().enabled);
        assert!(guards.read().unwrap().context.is_none());
        let _ = state;
    }
}

mod enable_flow_guards {
    use super::*;

    #[test]
    fn toggles_the_opt_in_guard_and_captures_the_enable_time_context() {
        let guards = guard_state();
        let state = log_state();
        enable_flow_guards(&guards, &state, Arc::new(|| 0.0));
        assert!(guards.read().unwrap().enabled);
        assert!(guards.read().unwrap().context.is_some());
        disable_flow_guards(&guards);
        assert!(!guards.read().unwrap().enabled);
        assert!(guards.read().unwrap().context.is_none());
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
        assert_eq!(parse_flow_guard_kind("nope"), None);
    }
}

mod report_flow_guard {
    use super::*;

    #[test]
    fn logs_a_warn_entry_with_the_exact_kind_string_and_live_clock_time_when_enabled() {
        let guards = guard_state();
        let state = log_state();
        enable_flow_guards(&guards, &state, Arc::new(|| 42.0));
        let memory = create_memory_log_sink(8);
        add_log_sink(&state, memory.sink.clone());
        report_flow_guard(&guards, FlowGuardKind::DuplicateStatePush);
        remove_log_sink(&state, &memory.sink);
        let entries = get_memory_log_sink_entries(&memory);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel, Some("flow".to_string()));
        assert_eq!(entries[0].timestamp_ms, 42.0);
        match &entries[0].data {
            LogData::Record(record) => match record.get("kind") {
                Some(LogValue::Str(kind)) => assert_eq!(kind, "duplicate-state-push"),
                _ => panic!("expected a kind string"),
            },
            _ => panic!("expected a record payload"),
        }
    }

    #[test]
    fn is_a_no_op_when_guards_are_disabled() {
        let guards = guard_state();
        let state = log_state();
        let memory = create_memory_log_sink(8);
        add_log_sink(&state, memory.sink.clone());
        report_flow_guard(&guards, FlowGuardKind::TransitionDuringTransition);
        remove_log_sink(&state, &memory.sink);
        assert!(get_memory_log_sink_entries(&memory).is_empty());
    }

    #[test]
    fn transition_during_transition_is_reported_when_the_guard_depth_is_already_positive() {
        let guards = guard_state();
        let state = log_state();
        enable_flow_guards(&guards, &state, Arc::new(|| 3.0));
        guards.write().unwrap().transition_depth = 1;
        let memory = create_memory_log_sink(8);
        add_log_sink(&state, memory.sink.clone());
        let stack = create_flow_stack();
        push_flow_state(&stack, plain("A"), &guards);
        remove_log_sink(&state, &memory.sink);
        let entries = get_memory_log_sink_entries(&memory);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].timestamp_ms, 3.0);
        match &entries[0].data {
            LogData::Record(record) => match record.get("kind") {
                Some(LogValue::Str(kind)) => assert_eq!(kind, "transition-during-transition"),
                _ => panic!("expected a kind string"),
            },
            _ => panic!("expected a record payload"),
        }
        assert_eq!(guards.read().unwrap().transition_depth, 1);
    }

    #[test]
    fn duplicate_state_push_is_reported_by_shared_state_identity() {
        let guards = guard_state();
        let state = log_state();
        enable_flow_guards(&guards, &state, Arc::new(|| 0.0));
        let memory = create_memory_log_sink(8);
        add_log_sink(&state, memory.sink.clone());
        let stack = create_flow_stack();
        let a = plain("A");
        push_flow_state(&stack, a.clone(), &guards);
        push_flow_state(&stack, a, &guards);
        remove_log_sink(&state, &memory.sink);
        let entries = get_memory_log_sink_entries(&memory);
        assert_eq!(entries.len(), 1);
        match &entries[0].data {
            LogData::Record(record) => match record.get("kind") {
                Some(LogValue::Str(kind)) => assert_eq!(kind, "duplicate-state-push"),
                _ => panic!("expected a kind string"),
            },
            _ => panic!("expected a record payload"),
        }
    }

    #[test]
    fn equal_but_distinct_states_are_not_a_duplicate() {
        let guards = guard_state();
        let state = log_state();
        enable_flow_guards(&guards, &state, Arc::new(|| 0.0));
        let memory = create_memory_log_sink(8);
        add_log_sink(&state, memory.sink.clone());
        let stack = create_flow_stack();
        push_flow_state(&stack, plain("A"), &guards);
        push_flow_state(&stack, plain("A"), &guards);
        remove_log_sink(&state, &memory.sink);
        assert!(get_memory_log_sink_entries(&memory).is_empty());
    }
}
