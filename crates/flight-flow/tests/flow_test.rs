use std::sync::{Arc, Mutex, RwLock};

use flight_entity::Ref;
use flight_flow::*;

fn guard_state() -> FlowGuardStateRef {
    return Arc::new(RwLock::new(FlowGuardState {
        enabled: false,
        transition_depth: 0,
        context: None,
    }));
}

fn state(state: FlowState) -> Ref<FlowState> {
    return Arc::new(RwLock::new(state));
}

fn labeled_state(name: &str, log: &Arc<Mutex<Vec<String>>>) -> Ref<FlowState> {
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
    return state(FlowState {
        name: Some(name.to_string()),
        on_enter: Some(Arc::new(move || {
            enter_log
                .lock()
                .unwrap()
                .push(format!("{}.enter", enter_name))
        })),
        on_exit: Some(Arc::new(move || {
            exit_log.lock().unwrap().push(format!("{}.exit", exit_name))
        })),
        on_pause: Some(Arc::new(move || {
            pause_log
                .lock()
                .unwrap()
                .push(format!("{}.pause", pause_name))
        })),
        on_resume: Some(Arc::new(move || {
            resume_log
                .lock()
                .unwrap()
                .push(format!("{}.resume", resume_name))
        })),
        on_update: Some(Arc::new(move |dt: f32| {
            update_log
                .lock()
                .unwrap()
                .push(format!("{}.update:{}", update_name, dt))
        })),
        render_below: None,
        update_below: None,
    });
}

fn panicking_on_enter() -> Ref<FlowState> {
    return state(FlowState {
        name: Some("panics".to_string()),
        on_enter: Some(Arc::new(|| panic!("on_enter failed"))),
        on_exit: None,
        on_pause: None,
        on_resume: None,
        on_update: None,
        render_below: None,
        update_below: None,
    });
}

fn plain(name: &str) -> Ref<FlowState> {
    return state(FlowState {
        name: Some(name.to_string()),
        on_enter: None,
        on_exit: None,
        on_pause: None,
        on_resume: None,
        on_update: None,
        render_below: None,
        update_below: None,
    });
}

mod clear_flow_stack {
    use super::*;

    #[test]
    fn exits_every_state_top_to_bottom_and_empties_the_stack() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let guards = guard_state();
        push_flow_state(&stack, labeled_state("A", &log), &guards);
        push_flow_state(&stack, labeled_state("B", &log), &guards);
        push_flow_state(&stack, labeled_state("C", &log), &guards);
        log.lock().unwrap().clear();
        clear_flow_stack(&stack);
        assert_eq!(*log.lock().unwrap(), vec!["C.exit", "B.exit", "A.exit"]);
        assert_eq!(get_flow_stack_depth(&stack), 0);
    }

    #[test]
    fn is_a_no_op_on_an_empty_stack() {
        let stack = create_flow_stack();
        clear_flow_stack(&stack);
        assert_eq!(get_flow_stack_depth(&stack), 0);
    }

    // TS clearFlowStack runs each onExit while the states are still on the stack; an exit that
    // queries the stack sees it as it stood.
    #[test]
    fn exits_while_the_states_are_still_on_the_stack() {
        let stack = create_flow_stack();
        let guards = guard_state();
        let seen = Arc::new(Mutex::new(Vec::new()));
        for name in ["A", "B"] {
            let observer = stack.clone();
            let depths = seen.clone();
            push_flow_state(
                &stack,
                state(FlowState {
                    name: Some(name.to_string()),
                    on_enter: None,
                    on_exit: Some(Arc::new(move || {
                        depths.lock().unwrap().push(get_flow_stack_depth(&observer));
                    })),
                    on_pause: None,
                    on_resume: None,
                    on_update: None,
                    render_below: None,
                    update_below: None,
                }),
                &guards,
            );
        }
        clear_flow_stack(&stack);
        assert_eq!(*seen.lock().unwrap(), vec![2, 2]);
        assert_eq!(get_flow_stack_depth(&stack), 0);
    }
}

mod create_flow_stack {
    use super::*;

    #[test]
    fn allocates_an_empty_stack() {
        let stack = create_flow_stack();
        assert_eq!(get_flow_stack_depth(&stack), 0);
    }

    #[test]
    fn allocates_a_fresh_independent_stack_each_call() {
        let a = create_flow_stack();
        let b = create_flow_stack();
        let guards = guard_state();
        push_flow_state(&a, plain("A"), &guards);
        assert_eq!(get_flow_stack_depth(&b), 0);
    }

    #[test]
    fn allocates_an_entity_with_an_empty_runtime_slot() {
        let stack = create_flow_stack();
        assert!(!flight_entity::has_entity_runtime(&*stack.read().unwrap()));
    }
}

mod get_active_flow_state {
    use super::*;

    #[test]
    fn returns_the_top_of_the_stack() {
        let stack = create_flow_stack();
        let guards = guard_state();
        let b = plain("B");
        push_flow_state(&stack, plain("A"), &guards);
        push_flow_state(&stack, b.clone(), &guards);
        assert!(Arc::ptr_eq(&get_active_flow_state(&stack).unwrap(), &b));
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
        let stack = create_flow_stack();
        let guards = guard_state();
        assert_eq!(get_flow_stack_depth(&stack), 0);
        push_flow_state(&stack, plain("A"), &guards);
        push_flow_state(&stack, plain("B"), &guards);
        assert_eq!(get_flow_stack_depth(&stack), 2);
        pop_flow_state(&stack);
        assert_eq!(get_flow_stack_depth(&stack), 1);
    }
}

mod get_flow_stack_visible_states {
    use super::*;

    #[test]
    fn fills_only_the_top_when_it_is_opaque() {
        let stack = create_flow_stack();
        let guards = guard_state();
        push_flow_state(&stack, plain("A"), &guards);
        let b = plain("B");
        push_flow_state(&stack, b.clone(), &guards);
        let mut out = Vec::new();
        get_flow_stack_visible_states(&mut out, &stack);
        assert_eq!(out.len(), 1);
        assert!(Arc::ptr_eq(&out[0], &b));
    }

    #[test]
    fn includes_the_contiguous_render_below_run_bottom_to_top() {
        let stack = create_flow_stack();
        let guards = guard_state();
        let a = plain("A");
        let mut b = FlowState {
            name: Some("B".to_string()),
            on_enter: None,
            on_exit: None,
            on_pause: None,
            on_resume: None,
            on_update: None,
            render_below: Some(true),
            update_below: None,
        };
        b.render_below = Some(true);
        let b = state(b);
        let mut c = FlowState {
            name: Some("C".to_string()),
            on_enter: None,
            on_exit: None,
            on_pause: None,
            on_resume: None,
            on_update: None,
            render_below: Some(true),
            update_below: None,
        };
        c.render_below = Some(true);
        let c = state(c);
        push_flow_state(&stack, a.clone(), &guards);
        push_flow_state(&stack, b.clone(), &guards);
        push_flow_state(&stack, c.clone(), &guards);
        let mut out = Vec::new();
        get_flow_stack_visible_states(&mut out, &stack);
        assert_eq!(out.len(), 3);
        assert!(Arc::ptr_eq(&out[0], &a));
        assert!(Arc::ptr_eq(&out[1], &b));
        assert!(Arc::ptr_eq(&out[2], &c));
    }

    #[test]
    fn stops_at_the_first_opaque_state_below_a_translucent_overlay() {
        let stack = create_flow_stack();
        let guards = guard_state();
        let b = plain("B");
        let c = state(FlowState {
            name: Some("C".to_string()),
            on_enter: None,
            on_exit: None,
            on_pause: None,
            on_resume: None,
            on_update: None,
            render_below: Some(true),
            update_below: None,
        });
        push_flow_state(&stack, plain("A"), &guards);
        push_flow_state(&stack, b.clone(), &guards);
        push_flow_state(&stack, c.clone(), &guards);
        let mut out = Vec::new();
        get_flow_stack_visible_states(&mut out, &stack);
        assert_eq!(out.len(), 2);
        assert!(Arc::ptr_eq(&out[0], &b));
        assert!(Arc::ptr_eq(&out[1], &c));
    }

    #[test]
    fn clears_the_out_list_before_filling_and_can_be_reused() {
        let stack = create_flow_stack();
        let guards = guard_state();
        let a = plain("A");
        push_flow_state(&stack, a.clone(), &guards);
        let stale = plain("stale");
        let mut out = vec![stale.clone(), stale];
        get_flow_stack_visible_states(&mut out, &stack);
        assert_eq!(out.len(), 1);
        assert!(Arc::ptr_eq(&out[0], &a));
    }

    #[test]
    fn leaves_the_out_list_empty_for_an_empty_stack() {
        let stack = create_flow_stack();
        let stale = plain("stale");
        let mut out = vec![stale];
        get_flow_stack_visible_states(&mut out, &stack);
        assert!(out.is_empty());
    }
}

mod initialize_flow_stack {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_flow_stack() {
        let stack = create_flow_stack();
        stack.write().unwrap().states.push(plain("stale"));
        flight_flow::contract::initialize_flow_stack(&mut *stack.write().unwrap());
        assert!(stack.read().unwrap().states.is_empty());
    }
}

mod pop_flow_state {
    use super::*;

    #[test]
    fn exits_the_top_and_resumes_the_revealed_state_returning_the_popped_state() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let guards = guard_state();
        push_flow_state(&stack, labeled_state("A", &log), &guards);
        let b = labeled_state("B", &log);
        push_flow_state(&stack, b.clone(), &guards);
        log.lock().unwrap().clear();
        let popped = pop_flow_state(&stack).unwrap();
        assert_eq!(*log.lock().unwrap(), vec!["B.exit", "A.resume"]);
        assert!(Arc::ptr_eq(&popped, &b));
        assert_eq!(get_flow_stack_depth(&stack), 1);
    }

    #[test]
    fn returns_none_when_the_stack_is_empty() {
        let stack = create_flow_stack();
        assert!(pop_flow_state(&stack).is_none());
    }

    #[test]
    fn exits_the_last_state_without_resuming_anything_below() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let guards = guard_state();
        push_flow_state(&stack, labeled_state("A", &log), &guards);
        log.lock().unwrap().clear();
        pop_flow_state(&stack);
        assert_eq!(*log.lock().unwrap(), vec!["A.exit"]);
    }

    #[test]
    fn does_not_panic_when_the_popped_state_omits_callbacks() {
        let stack = create_flow_stack();
        stack.write().unwrap().states.push(plain("A"));
        assert!(pop_flow_state(&stack).is_some());
    }
}

mod push_flow_state {
    use super::*;

    #[test]
    fn enters_a_state_pushed_onto_an_empty_stack() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let guards = guard_state();
        push_flow_state(&stack, labeled_state("A", &log), &guards);
        assert_eq!(*log.lock().unwrap(), vec!["A.enter"]);
    }

    #[test]
    fn pauses_the_previous_top_before_entering_the_new_state() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let guards = guard_state();
        push_flow_state(&stack, labeled_state("A", &log), &guards);
        log.lock().unwrap().clear();
        push_flow_state(&stack, labeled_state("B", &log), &guards);
        assert_eq!(*log.lock().unwrap(), vec!["A.pause", "B.enter"]);
        assert_eq!(get_flow_stack_depth(&stack), 2);
    }

    #[test]
    fn does_not_panic_when_the_states_omit_lifecycle_callbacks() {
        let stack = create_flow_stack();
        let guards = guard_state();
        push_flow_state(&stack, plain("A"), &guards);
        push_flow_state(&stack, plain("B"), &guards);
        assert_eq!(get_flow_stack_depth(&stack), 2);
    }

    #[test]
    fn supports_a_real_reentrant_push_from_on_enter() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let guards = guard_state();
        let nested_log = log.clone();
        let nested_stack = stack.clone();
        let nested_guards = guards.clone();
        let mut a = FlowState {
            name: Some("A".to_string()),
            on_enter: None,
            on_exit: None,
            on_pause: None,
            on_resume: None,
            on_update: None,
            render_below: None,
            update_below: None,
        };
        a.on_enter = Some(Arc::new(move || {
            nested_log.lock().unwrap().push("A.enter".to_string());
            let b = state(FlowState {
                name: Some("B".to_string()),
                on_enter: Some(Arc::new({
                    let inner = nested_log.clone();
                    move || inner.lock().unwrap().push("B.enter".to_string())
                })),
                on_exit: None,
                on_pause: None,
                on_resume: None,
                on_update: None,
                render_below: None,
                update_below: None,
            });
            push_flow_state(&nested_stack, b, &nested_guards);
        }));
        push_flow_state(&stack, state(a), &guards);
        assert_eq!(*log.lock().unwrap(), vec!["A.enter", "B.enter"]);
        assert_eq!(get_flow_stack_depth(&stack), 2);
        assert_eq!(guards.read().unwrap().transition_depth, 0);
    }

    #[test]
    fn supports_a_real_reentrant_push_from_on_pause() {
        let log: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let guards = guard_state();
        let stack_for_pause = stack.clone();
        let guards_for_pause = guards.clone();
        let paused_once = Arc::new(Mutex::new(false));
        let paused_once_slot = paused_once.clone();
        let mut a = FlowState {
            name: Some("A".to_string()),
            on_enter: None,
            on_exit: None,
            on_pause: None,
            on_resume: None,
            on_update: None,
            render_below: None,
            update_below: None,
        };
        a.on_pause = Some(Arc::new(move || {
            let mut fired = paused_once_slot.lock().unwrap();
            if *fired {
                return;
            }
            *fired = true;
            drop(fired);
            push_flow_state(&stack_for_pause, plain("C"), &guards_for_pause);
        }));
        push_flow_state(&stack, state(a), &guards);
        push_flow_state(&stack, plain("B"), &guards);
        let states = stack.read().unwrap();
        let names: Vec<Option<String>> = states
            .states
            .iter()
            .map(|state| state.read().unwrap().name.clone())
            .collect();
        assert_eq!(
            names,
            vec![
                Some("A".to_string()),
                Some("C".to_string()),
                Some("B".to_string())
            ]
        );
        assert_eq!(guards.read().unwrap().transition_depth, 0);
        let _ = log;
    }

    // TS wraps the transition in try/finally; the Rust depth guard releases on unwind the same way.
    #[test]
    fn restores_the_transition_depth_when_a_callback_panics() {
        let stack = create_flow_stack();
        let guards = guard_state();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            push_flow_state(&stack, panicking_on_enter(), &guards);
        }));
        assert!(result.is_err());
        assert_eq!(guards.read().unwrap().transition_depth, 0);
    }
}

mod replace_flow_state {
    use super::*;

    #[test]
    fn exits_the_top_and_enters_the_replacement_without_touching_the_state_below() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let guards = guard_state();
        let a = labeled_state("A", &log);
        push_flow_state(&stack, a.clone(), &guards);
        push_flow_state(&stack, labeled_state("B", &log), &guards);
        log.lock().unwrap().clear();
        replace_flow_state(&stack, labeled_state("C", &log), &guards);
        assert_eq!(*log.lock().unwrap(), vec!["B.exit", "C.enter"]);
        assert_eq!(get_flow_stack_depth(&stack), 2);
        assert!(Arc::ptr_eq(&stack.read().unwrap().states[0], &a));
    }

    #[test]
    fn just_pushes_and_enters_on_an_empty_stack() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let guards = guard_state();
        replace_flow_state(&stack, labeled_state("C", &log), &guards);
        assert_eq!(*log.lock().unwrap(), vec!["C.enter"]);
        assert_eq!(get_flow_stack_depth(&stack), 1);
    }

    #[test]
    fn does_not_panic_when_the_states_omit_callbacks() {
        let stack = create_flow_stack();
        stack.write().unwrap().states.push(plain("A"));
        let guards = guard_state();
        replace_flow_state(&stack, plain("B"), &guards);
        assert_eq!(get_flow_stack_depth(&stack), 1);
    }

    // TS wraps the transition in try/finally; the Rust depth guard releases on unwind the same way.
    #[test]
    fn restores_the_transition_depth_when_a_callback_panics() {
        let stack = create_flow_stack();
        let guards = guard_state();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            replace_flow_state(&stack, panicking_on_enter(), &guards);
        }));
        assert!(result.is_err());
        assert_eq!(guards.read().unwrap().transition_depth, 0);
    }
}

mod update_flow_stack {
    use super::*;

    #[test]
    fn ticks_only_the_top_with_the_frame_delta_time() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let guards = guard_state();
        push_flow_state(&stack, labeled_state("A", &log), &guards);
        push_flow_state(&stack, labeled_state("B", &log), &guards);
        log.lock().unwrap().clear();
        update_flow_stack(&stack, 0.016);
        assert_eq!(*log.lock().unwrap(), vec!["B.update:0.016"]);
    }

    #[test]
    fn ticks_the_state_beneath_a_transparent_update_below_overlay() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let guards = guard_state();
        push_flow_state(&stack, labeled_state("A", &log), &guards);
        let mut b = labeled_state("B", &log).read().unwrap().clone();
        b.update_below = Some(true);
        push_flow_state(&stack, state(b), &guards);
        log.lock().unwrap().clear();
        update_flow_stack(&stack, 0.02);
        assert_eq!(*log.lock().unwrap(), vec!["B.update:0.02", "A.update:0.02"]);
    }

    #[test]
    fn does_not_tick_below_an_opaque_overlay() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let guards = guard_state();
        push_flow_state(&stack, labeled_state("A", &log), &guards);
        push_flow_state(&stack, labeled_state("B", &log), &guards);
        log.lock().unwrap().clear();
        update_flow_stack(&stack, 0.01);
        assert_eq!(*log.lock().unwrap(), vec!["B.update:0.01"]);
    }

    #[test]
    fn walks_a_chain_of_update_below_overlays_and_stops_at_the_first_opaque_one() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let guards = guard_state();
        push_flow_state(&stack, labeled_state("A", &log), &guards);
        push_flow_state(&stack, labeled_state("B", &log), &guards);
        let mut c = labeled_state("C", &log).read().unwrap().clone();
        c.update_below = Some(true);
        push_flow_state(&stack, state(c), &guards);
        let mut d = labeled_state("D", &log).read().unwrap().clone();
        d.update_below = Some(true);
        push_flow_state(&stack, state(d), &guards);
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
        let stack = create_flow_stack();
        stack.write().unwrap().states.push(state(FlowState {
            name: Some("lower".to_string()),
            on_enter: None,
            on_exit: None,
            on_pause: None,
            on_resume: None,
            on_update: None,
            render_below: None,
            update_below: Some(true),
        }));
        stack.write().unwrap().states.push(plain("top"));
        update_flow_stack(&stack, 0.016);
    }
}
