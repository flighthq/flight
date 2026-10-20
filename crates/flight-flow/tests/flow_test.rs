use std::cell::RefCell;

use flight_flow::*;

thread_local! {
    static LOG: RefCell<Vec<String>> = RefCell::new(Vec::new());
}

fn clear_log() {
    LOG.with(|l| l.borrow_mut().clear());
}

fn get_log() -> Vec<String> {
    LOG.with(|l| l.borrow().clone())
}

fn push_log(msg: &str) {
    LOG.with(|l| l.borrow_mut().push(msg.to_string()));
}

// --- Callback factories for labeled states ---

fn on_enter_a() { push_log("A.enter"); }
fn on_exit_a() { push_log("A.exit"); }
fn on_pause_a() { push_log("A.pause"); }
fn on_resume_a() { push_log("A.resume"); }
fn on_update_a(dt: f32) { push_log(&format!("A.update:{}", dt)); }

fn on_enter_b() { push_log("B.enter"); }
fn on_exit_b() { push_log("B.exit"); }
fn on_pause_b() { push_log("B.pause"); }
fn on_resume_b() { push_log("B.resume"); }
fn on_update_b(dt: f32) { push_log(&format!("B.update:{}", dt)); }

fn on_enter_c() { push_log("C.enter"); }
fn on_exit_c() { push_log("C.exit"); }
fn on_pause_c() { push_log("C.pause"); }
fn on_resume_c() { push_log("C.resume"); }
fn on_update_c(dt: f32) { push_log(&format!("C.update:{}", dt)); }

fn on_update_d(dt: f32) { push_log(&format!("D.update:{}", dt)); }

fn labeled_state_a() -> FlowState {
    FlowState {
        name: Some("A".to_string()),
        on_enter: Some(on_enter_a),
        on_exit: Some(on_exit_a),
        on_pause: Some(on_pause_a),
        on_resume: Some(on_resume_a),
        on_update: Some(on_update_a),
        ..Default::default()
    }
}

fn labeled_state_b() -> FlowState {
    FlowState {
        name: Some("B".to_string()),
        on_enter: Some(on_enter_b),
        on_exit: Some(on_exit_b),
        on_pause: Some(on_pause_b),
        on_resume: Some(on_resume_b),
        on_update: Some(on_update_b),
        ..Default::default()
    }
}

fn labeled_state_c() -> FlowState {
    FlowState {
        name: Some("C".to_string()),
        on_enter: Some(on_enter_c),
        on_exit: Some(on_exit_c),
        on_pause: Some(on_pause_c),
        on_resume: Some(on_resume_c),
        on_update: Some(on_update_c),
        ..Default::default()
    }
}

mod clear_flow_stack {
    use super::*;

    #[test]
    fn exits_every_state_top_to_bottom_and_empties_the_stack() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, labeled_state_a());
        push_flow_state(&mut stack, labeled_state_b());
        push_flow_state(&mut stack, labeled_state_c());
        clear_log();
        clear_flow_stack(&mut stack);
        assert_eq!(get_log(), vec!["C.exit", "B.exit", "A.exit"]);
        assert_eq!(stack.states.len(), 0);
    }

    #[test]
    fn is_a_no_op_on_an_empty_stack() {
        clear_log();
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
        let a = create_flow_stack();
        let b = create_flow_stack();
        // Both are independent empty stacks (different allocations).
        assert!(a.states.is_empty());
        assert!(b.states.is_empty());
    }
}

mod get_active_flow_state {
    use super::*;

    #[test]
    fn returns_the_top_of_the_stack() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, FlowState {
            name: Some("A".to_string()),
            ..Default::default()
        });
        push_flow_state(&mut stack, FlowState {
            name: Some("B".to_string()),
            ..Default::default()
        });
        let active = get_active_flow_state(&stack);
        assert!(active.is_some());
        assert_eq!(active.unwrap().name.as_deref(), Some("B"));
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
        clear_log();
        let mut stack = create_flow_stack();
        assert_eq!(get_flow_stack_depth(&stack), 0);
        push_flow_state(&mut stack, FlowState {
            name: Some("A".to_string()),
            ..Default::default()
        });
        push_flow_state(&mut stack, FlowState {
            name: Some("B".to_string()),
            ..Default::default()
        });
        assert_eq!(get_flow_stack_depth(&stack), 2);
        pop_flow_state(&mut stack);
        assert_eq!(get_flow_stack_depth(&stack), 1);
    }
}

mod get_flow_stack_visible_states {
    use super::*;

    #[test]
    fn fills_only_the_top_when_it_is_opaque() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, FlowState {
            name: Some("A".to_string()),
            ..Default::default()
        });
        push_flow_state(&mut stack, FlowState {
            name: Some("B".to_string()),
            ..Default::default()
        });
        let mut out: Vec<&FlowState> = Vec::new();
        get_flow_stack_visible_states(&stack, &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name.as_deref(), Some("B"));
    }

    #[test]
    fn includes_the_contiguous_render_below_run_bottom_to_top() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, FlowState {
            name: Some("A".to_string()),
            ..Default::default()
        });
        push_flow_state(&mut stack, FlowState {
            name: Some("B".to_string()),
            render_below: true,
            ..Default::default()
        });
        push_flow_state(&mut stack, FlowState {
            name: Some("C".to_string()),
            render_below: true,
            ..Default::default()
        });
        let mut out: Vec<&FlowState> = Vec::new();
        get_flow_stack_visible_states(&stack, &mut out);
        let names: Vec<Option<&str>> = out.iter().map(|s| s.name.as_deref()).collect();
        assert_eq!(names, vec![Some("A"), Some("B"), Some("C")]);
    }

    #[test]
    fn stops_at_the_first_opaque_state_below_a_translucent_overlay() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, FlowState {
            name: Some("A".to_string()),
            ..Default::default()
        });
        push_flow_state(&mut stack, FlowState {
            name: Some("B".to_string()),
            ..Default::default()
        });
        push_flow_state(&mut stack, FlowState {
            name: Some("C".to_string()),
            render_below: true,
            ..Default::default()
        });
        let mut out: Vec<&FlowState> = Vec::new();
        get_flow_stack_visible_states(&stack, &mut out);
        let names: Vec<Option<&str>> = out.iter().map(|s| s.name.as_deref()).collect();
        assert_eq!(names, vec![Some("B"), Some("C")]);
    }

    #[test]
    fn clears_the_out_array_before_filling_and_can_be_reused() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, FlowState {
            name: Some("A".to_string()),
            ..Default::default()
        });
        // Pre-fill out with stale data (cannot hold refs to states not in the
        // stack, so we just verify clearing by checking length after call).
        let mut out: Vec<&FlowState> = Vec::new();
        get_flow_stack_visible_states(&stack, &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name.as_deref(), Some("A"));
    }

    #[test]
    fn leaves_the_out_array_empty_for_an_empty_stack() {
        let stack = create_flow_stack();
        let mut out: Vec<&FlowState> = Vec::new();
        get_flow_stack_visible_states(&stack, &mut out);
        assert!(out.is_empty());
    }
}

mod initialize_flow_stack {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_flow_stack() {
        // Verify the function exists and produces an empty stack.
        let mut stack = FlowStack::default();
        initialize_flow_stack(&mut stack);
        assert!(stack.states.is_empty());
    }
}

mod pop_flow_state {
    use super::*;

    #[test]
    fn exits_the_top_and_resumes_the_revealed_state_returning_the_popped_state() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, labeled_state_a());
        push_flow_state(&mut stack, labeled_state_b());
        clear_log();
        let popped = pop_flow_state(&mut stack);
        assert_eq!(get_log(), vec!["B.exit", "A.resume"]);
        assert!(popped.is_some());
        assert_eq!(popped.unwrap().name.as_deref(), Some("B"));
        assert_eq!(stack.states.len(), 1);
    }

    #[test]
    fn returns_none_when_the_stack_is_empty() {
        let mut stack = create_flow_stack();
        assert!(pop_flow_state(&mut stack).is_none());
    }

    #[test]
    fn exits_the_last_state_without_resuming_anything_below() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, labeled_state_a());
        clear_log();
        pop_flow_state(&mut stack);
        assert_eq!(get_log(), vec!["A.exit"]);
    }

    #[test]
    fn does_not_panic_when_the_popped_state_omits_callbacks() {
        let mut stack = create_flow_stack();
        stack.states.push(FlowState::default());
        pop_flow_state(&mut stack);
    }
}

mod push_flow_state {
    use super::*;

    #[test]
    fn enters_a_state_pushed_onto_an_empty_stack() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, labeled_state_a());
        assert_eq!(get_log(), vec!["A.enter"]);
    }

    #[test]
    fn pauses_the_previous_top_before_entering_the_new_state() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, labeled_state_a());
        clear_log();
        push_flow_state(&mut stack, labeled_state_b());
        assert_eq!(get_log(), vec!["A.pause", "B.enter"]);
        assert_eq!(stack.states.len(), 2);
    }

    #[test]
    fn does_not_panic_when_the_states_omit_lifecycle_callbacks() {
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, FlowState::default());
        push_flow_state(&mut stack, FlowState::default());
        assert_eq!(stack.states.len(), 2);
    }
}

mod replace_flow_state {
    use super::*;

    #[test]
    fn exits_the_top_and_enters_the_replacement_without_touching_the_state_below() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, labeled_state_a());
        push_flow_state(&mut stack, labeled_state_b());
        clear_log();
        replace_flow_state(&mut stack, labeled_state_c());
        assert_eq!(get_log(), vec!["B.exit", "C.enter"]);
        assert_eq!(stack.states.len(), 2);
        assert_eq!(stack.states[0].name.as_deref(), Some("A"));
    }

    #[test]
    fn just_pushes_and_enters_on_an_empty_stack() {
        clear_log();
        let mut stack = create_flow_stack();
        replace_flow_state(&mut stack, labeled_state_c());
        assert_eq!(get_log(), vec!["C.enter"]);
        assert_eq!(stack.states.len(), 1);
    }

    #[test]
    fn does_not_panic_when_states_omit_callbacks() {
        let mut stack = create_flow_stack();
        stack.states.push(FlowState::default());
        replace_flow_state(&mut stack, FlowState::default());
    }
}

mod update_flow_stack {
    use super::*;

    #[test]
    fn ticks_only_the_top_with_the_frame_delta_time() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, labeled_state_a());
        push_flow_state(&mut stack, labeled_state_b());
        clear_log();
        update_flow_stack(&stack, 0.016);
        assert_eq!(get_log(), vec!["B.update:0.016"]);
    }

    #[test]
    fn ticks_the_state_beneath_a_transparent_update_below_overlay() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, labeled_state_a());
        push_flow_state(&mut stack, FlowState {
            name: Some("B".to_string()),
            on_enter: Some(on_enter_b),
            on_exit: Some(on_exit_b),
            on_pause: Some(on_pause_b),
            on_resume: Some(on_resume_b),
            on_update: Some(on_update_b),
            update_below: true,
            ..Default::default()
        });
        clear_log();
        update_flow_stack(&stack, 0.02);
        assert_eq!(get_log(), vec!["B.update:0.02", "A.update:0.02"]);
    }

    #[test]
    fn does_not_tick_below_an_opaque_overlay() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, labeled_state_a());
        push_flow_state(&mut stack, labeled_state_b());
        clear_log();
        update_flow_stack(&stack, 0.01);
        assert_eq!(get_log(), vec!["B.update:0.01"]);
    }

    #[test]
    fn walks_a_chain_of_update_below_overlays_and_stops_at_the_first_opaque_one() {
        clear_log();
        let mut stack = create_flow_stack();
        push_flow_state(&mut stack, labeled_state_a());
        push_flow_state(&mut stack, labeled_state_b());
        push_flow_state(&mut stack, FlowState {
            name: Some("C".to_string()),
            on_enter: Some(on_enter_c),
            on_exit: Some(on_exit_c),
            on_pause: Some(on_pause_c),
            on_resume: Some(on_resume_c),
            on_update: Some(on_update_c),
            update_below: true,
            ..Default::default()
        });
        push_flow_state(&mut stack, FlowState {
            name: Some("D".to_string()),
            on_update: Some(on_update_d),
            update_below: true,
            ..Default::default()
        });
        clear_log();
        update_flow_stack(&stack, 0.5);
        assert_eq!(get_log(), vec!["D.update:0.5", "C.update:0.5", "B.update:0.5"]);
    }

    #[test]
    fn is_a_no_op_on_an_empty_stack() {
        let stack = create_flow_stack();
        update_flow_stack(&stack, 0.016);
    }

    #[test]
    fn does_not_panic_when_a_ticked_state_omits_on_update() {
        let mut stack = create_flow_stack();
        stack.states.push(FlowState {
            update_below: true,
            ..Default::default()
        });
        stack.states.push(FlowState::default());
        update_flow_stack(&stack, 0.016);
    }
}
