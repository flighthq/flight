use std::sync::{Arc, Mutex, RwLock};

use flight_flow::*;
use flight_log::{create_log_state, LogStateRef};

fn guard_state() -> FlowGuardStateRef {
    return Arc::new(RwLock::new(FlowGuardState {
        enabled: false,
        transition_depth: 0,
    }));
}

fn log_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

fn labeled_state(name: &str, log: &Arc<Mutex<Vec<String>>>) -> FlowState {
    let enter_name = name.to_string();
    let exit_name = name.to_string();
    let pause_name = name.to_string();
    let resume_name = name.to_string();
    let update_name = name.to_string();
    let enter_log = log.clone();
    let exit_log = log.clone();
    let pause_log = log.clone();
    let resume_log = log.clone();
    let update_log = log.clone();
    return FlowState {
        name: Some(name.to_string()),
        on_enter: Some(Arc::new(move || enter_log.lock().unwrap().push(format!("{}.enter", enter_name)))),
        on_exit: Some(Arc::new(move || exit_log.lock().unwrap().push(format!("{}.exit", exit_name)))),
        on_pause: Some(Arc::new(move || pause_log.lock().unwrap().push(format!("{}.pause", pause_name)))),
        on_resume: Some(Arc::new(move || resume_log.lock().unwrap().push(format!("{}.resume", resume_name)))),
        on_update: Some(Arc::new(move |dt: f32| {
            update_log.lock().unwrap().push(format!("{}.update:{}", update_name, dt))
        })),
        render_below: None,
        update_below: None,
    };
}

fn plain(name: &str) -> FlowState {
    return FlowState {
        name: Some(name.to_string()),
        on_enter: None,
        on_exit: None,
        on_pause: None,
        on_resume: None,
        on_update: None,
        render_below: None,
        update_below: None,
    };
}

mod clear_flow_stack {
    use super::*;

    #[test]
    fn exits_every_state_top_to_bottom_and_empties_the_stack() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, labeled_state("A", &log), &guards, &log_state, 0.0);
        push_flow_state(&mut stack, labeled_state("B", &log), &guards, &log_state, 0.0);
        push_flow_state(&mut stack, labeled_state("C", &log), &guards, &log_state, 0.0);
        log.lock().unwrap().clear();
        clear_flow_stack(&mut stack);
        assert_eq!(*log.lock().unwrap(), vec!["C.exit", "B.exit", "A.exit"]);
        assert_eq!(stack.states.len(), 0);
    }

    #[test]
    fn is_a_no_op_on_an_empty_stack() {
        let mut stack = create_flow_stack();
        clear_flow_stack(&mut stack);
        assert_eq!(stack.states.len(), 0);
    }
}

mod create_flow_stack {
    use super::*;

    #[test]
    fn allocates_an_empty_stack() {
        let stack = create_flow_stack();
        assert!(stack.states.is_empty());
    }

    #[test]
    fn allocates_a_fresh_independent_stack_each_call() {
        let mut a = create_flow_stack();
        let b = create_flow_stack();
        a.states.push(plain("A"));
        assert!(b.states.is_empty());
    }

    #[test]
    fn allocates_an_entity_with_an_empty_runtime_slot() {
        let stack = create_flow_stack();
        assert!(!flight_entity::has_entity_runtime(&stack));
    }
}

mod get_active_flow_state {
    use super::*;

    #[test]
    fn returns_the_top_of_the_stack() {
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, plain("A"), &guards, &log_state, 0.0);
        push_flow_state(&mut stack, plain("B"), &guards, &log_state, 0.0);
        assert_eq!(get_active_flow_state(&stack).unwrap().name, Some("B".to_string()));
    }

    #[test]
    fn returns_none_on_an_empty_stack() {
        let stack = create_flow_stack();
        assert!(get_active_flow_state(&stack).is_none());
    }
}

mod get_flow_stack_depth {
    use super::*;

    #[test]
    fn counts_the_states_on_the_stack() {
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        assert_eq!(get_flow_stack_depth(&stack), 0);
        push_flow_state(&mut stack, plain("A"), &guards, &log_state, 0.0);
        push_flow_state(&mut stack, plain("B"), &guards, &log_state, 0.0);
        assert_eq!(get_flow_stack_depth(&stack), 2);
        pop_flow_state(&mut stack);
        assert_eq!(get_flow_stack_depth(&stack), 1);
    }
}

mod get_flow_stack_visible_states {
    use super::*;

    #[test]
    fn fills_only_the_top_when_it_is_opaque() {
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, plain("A"), &guards, &log_state, 0.0);
        push_flow_state(&mut stack, plain("B"), &guards, &log_state, 0.0);
        let mut out = Vec::new();
        get_flow_stack_visible_states(&mut out, &stack);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, Some("B".to_string()));
    }

    #[test]
    fn includes_the_contiguous_render_below_run_bottom_to_top() {
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, plain("A"), &guards, &log_state, 0.0);
        let mut b = plain("B");
        b.render_below = Some(true);
        let mut c = plain("C");
        c.render_below = Some(true);
        push_flow_state(&mut stack, b, &guards, &log_state, 0.0);
        push_flow_state(&mut stack, c, &guards, &log_state, 0.0);
        let mut out = Vec::new();
        get_flow_stack_visible_states(&mut out, &stack);
        let names: Vec<Option<String>> = out.iter().map(|s| s.name.clone()).collect();
        assert_eq!(
            names,
            vec![Some("A".to_string()), Some("B".to_string()), Some("C".to_string())]
        );
    }

    #[test]
    fn stops_at_the_first_opaque_state_below_a_translucent_overlay() {
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, plain("A"), &guards, &log_state, 0.0);
        push_flow_state(&mut stack, plain("B"), &guards, &log_state, 0.0);
        let mut c = plain("C");
        c.render_below = Some(true);
        push_flow_state(&mut stack, c, &guards, &log_state, 0.0);
        let mut out = Vec::new();
        get_flow_stack_visible_states(&mut out, &stack);
        let names: Vec<Option<String>> = out.iter().map(|s| s.name.clone()).collect();
        assert_eq!(names, vec![Some("B".to_string()), Some("C".to_string())]);
    }

    #[test]
    fn clears_the_out_list_before_filling_and_can_be_reused() {
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, plain("A"), &guards, &log_state, 0.0);
        let stale = plain("stale");
        let mut out = vec![&stale, &stale];
        get_flow_stack_visible_states(&mut out, &stack);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, Some("A".to_string()));
    }

    #[test]
    fn leaves_the_out_list_empty_for_an_empty_stack() {
        let stack = create_flow_stack();
        let stale = plain("stale");
        let mut out = vec![&stale];
        get_flow_stack_visible_states(&mut out, &stack);
        assert!(out.is_empty());
    }
}

mod initialize_flow_stack {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_flow_stack() {
        let mut stack = create_flow_stack();
        stack.states.push(plain("stale"));
        flight_flow::contract::initialize_flow_stack(&mut stack);
        assert!(stack.states.is_empty());
    }
}

mod pop_flow_state {
    use super::*;

    #[test]
    fn exits_the_top_and_resumes_the_revealed_state_returning_the_popped_state() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, labeled_state("A", &log), &guards, &log_state, 0.0);
        push_flow_state(&mut stack, labeled_state("B", &log), &guards, &log_state, 0.0);
        log.lock().unwrap().clear();
        let popped = pop_flow_state(&mut stack).unwrap();
        assert_eq!(*log.lock().unwrap(), vec!["B.exit", "A.resume"]);
        assert_eq!(popped.name, Some("B".to_string()));
        assert_eq!(stack.states.len(), 1);
    }

    #[test]
    fn returns_none_when_the_stack_is_empty() {
        let mut stack = create_flow_stack();
        assert!(pop_flow_state(&mut stack).is_none());
    }

    #[test]
    fn exits_the_last_state_without_resuming_anything_below() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, labeled_state("A", &log), &guards, &log_state, 0.0);
        log.lock().unwrap().clear();
        pop_flow_state(&mut stack);
        assert_eq!(*log.lock().unwrap(), vec!["A.exit"]);
    }

    #[test]
    fn does_not_panic_when_the_popped_state_omits_callbacks() {
        let mut stack = create_flow_stack();
        stack.states.push(plain("A"));
        assert!(pop_flow_state(&mut stack).is_some());
    }
}

mod push_flow_state {
    use super::*;

    #[test]
    fn enters_a_state_pushed_onto_an_empty_stack() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, labeled_state("A", &log), &guards, &log_state, 0.0);
        assert_eq!(*log.lock().unwrap(), vec!["A.enter"]);
    }

    #[test]
    fn pauses_the_previous_top_before_entering_the_new_state() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, labeled_state("A", &log), &guards, &log_state, 0.0);
        log.lock().unwrap().clear();
        push_flow_state(&mut stack, labeled_state("B", &log), &guards, &log_state, 0.0);
        assert_eq!(*log.lock().unwrap(), vec!["A.pause", "B.enter"]);
        assert_eq!(stack.states.len(), 2);
    }

    #[test]
    fn does_not_panic_when_the_states_omit_lifecycle_callbacks() {
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, plain("A"), &guards, &log_state, 0.0);
        push_flow_state(&mut stack, plain("B"), &guards, &log_state, 0.0);
        assert_eq!(stack.states.len(), 2);
    }
}

mod replace_flow_state {
    use super::*;

    #[test]
    fn exits_the_top_and_enters_the_replacement_without_touching_the_state_below() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, labeled_state("A", &log), &guards, &log_state, 0.0);
        push_flow_state(&mut stack, labeled_state("B", &log), &guards, &log_state, 0.0);
        log.lock().unwrap().clear();
        replace_flow_state(&mut stack, labeled_state("C", &log), &guards, &log_state, 0.0);
        assert_eq!(*log.lock().unwrap(), vec!["B.exit", "C.enter"]);
        assert_eq!(stack.states.len(), 2);
        assert_eq!(stack.states[0].name, Some("A".to_string()));
    }

    #[test]
    fn just_pushes_and_enters_on_an_empty_stack() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        replace_flow_state(&mut stack, labeled_state("C", &log), &guards, &log_state, 0.0);
        assert_eq!(*log.lock().unwrap(), vec!["C.enter"]);
        assert_eq!(stack.states.len(), 1);
    }

    #[test]
    fn does_not_panic_when_the_states_omit_callbacks() {
        let mut stack = create_flow_stack();
        stack.states.push(plain("A"));
        let guards = guard_state();
        let log_state = log_state();
        replace_flow_state(&mut stack, plain("B"), &guards, &log_state, 0.0);
        assert_eq!(stack.states.len(), 1);
    }
}

mod update_flow_stack {
    use super::*;

    #[test]
    fn ticks_only_the_top_with_the_frame_delta_time() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, labeled_state("A", &log), &guards, &log_state, 0.0);
        push_flow_state(&mut stack, labeled_state("B", &log), &guards, &log_state, 0.0);
        log.lock().unwrap().clear();
        update_flow_stack(&stack, 0.016);
        assert_eq!(*log.lock().unwrap(), vec!["B.update:0.016"]);
    }

    #[test]
    fn ticks_the_state_beneath_a_transparent_update_below_overlay() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, labeled_state("A", &log), &guards, &log_state, 0.0);
        let mut b = labeled_state("B", &log);
        b.update_below = Some(true);
        push_flow_state(&mut stack, b, &guards, &log_state, 0.0);
        log.lock().unwrap().clear();
        update_flow_stack(&stack, 0.02);
        assert_eq!(*log.lock().unwrap(), vec!["B.update:0.02", "A.update:0.02"]);
    }

    #[test]
    fn does_not_tick_below_an_opaque_overlay() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, labeled_state("A", &log), &guards, &log_state, 0.0);
        push_flow_state(&mut stack, labeled_state("B", &log), &guards, &log_state, 0.0);
        log.lock().unwrap().clear();
        update_flow_stack(&stack, 0.01);
        assert_eq!(*log.lock().unwrap(), vec!["B.update:0.01"]);
    }

    #[test]
    fn walks_a_chain_of_update_below_overlays_and_stops_at_the_first_opaque_one() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut stack = create_flow_stack();
        let guards = guard_state();
        let log_state = log_state();
        push_flow_state(&mut stack, labeled_state("A", &log), &guards, &log_state, 0.0);
        push_flow_state(&mut stack, labeled_state("B", &log), &guards, &log_state, 0.0);
        let mut c = labeled_state("C", &log);
        c.update_below = Some(true);
        push_flow_state(&mut stack, c, &guards, &log_state, 0.0);
        let mut d = labeled_state("D", &log);
        d.update_below = Some(true);
        push_flow_state(&mut stack, d, &guards, &log_state, 0.0);
        log.lock().unwrap().clear();
        update_flow_stack(&stack, 0.5);
        assert_eq!(
            *log.lock().unwrap(),
            vec!["D.update:0.5", "C.update:0.5", "B.update:0.5"]
        );
    }

    #[test]
    fn is_a_no_op_on_an_empty_stack() {
        let stack = create_flow_stack();
        update_flow_stack(&stack, 0.016);
    }

    #[test]
    fn does_not_panic_when_a_ticked_state_omits_on_update() {
        let mut stack = create_flow_stack();
        let mut lower = plain("lower");
        lower.update_below = Some(true);
        stack.states.push(lower);
        stack.states.push(plain("top"));
        update_flow_stack(&stack, 0.016);
    }
}
