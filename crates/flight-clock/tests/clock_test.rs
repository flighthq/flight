use std::sync::Arc;

use flight_clock::contract::*;
use flight_entity::Ref;

fn options(scale: Option<f64>, paused: Option<bool>) -> ClockOptions {
    return ClockOptions { scale, paused };
}

// A clock created with the canonical zero-field create, then given the requested options (D23 B).
fn clock_with(options: &ClockOptions) -> Ref<Clock> {
    let clock = create_clock();
    if let Some(scale) = options.scale {
        clock.write().unwrap().scale = scale;
    }
    if let Some(paused) = options.paused {
        clock.write().unwrap().paused = paused;
    }
    return clock;
}

fn is_same(a: &Option<Ref<Clock>>, b: &Ref<Clock>) -> bool {
    return match a {
        Some(a) => Arc::ptr_eq(a, b),
        None => false,
    };
}

fn children_are(clock: &Ref<Clock>, expected: &[&Ref<Clock>]) -> bool {
    let current = clock.read().unwrap();
    return current.children.len() == expected.len()
        && current
            .children
            .iter()
            .zip(expected.iter())
            .all(|(a, b)| Arc::ptr_eq(a, b));
}

mod add_clock_child {
    use super::*;

    #[test]
    fn attaches_a_child_and_sets_its_parent() {
        let parent = create_clock();
        let child = create_clock();
        add_clock_child(&parent, &child);
        assert!(is_same(&child.read().unwrap().parent, &parent));
        assert!(children_are(&parent, &[&child]));
    }

    #[test]
    fn is_a_no_op_when_the_child_is_already_parented_here() {
        let parent = create_clock();
        let child = create_clock();
        add_clock_child(&parent, &child);
        add_clock_child(&parent, &child);
        assert!(children_are(&parent, &[&child]));
    }

    #[test]
    fn reparents_detaching_from_the_previous_parent_first() {
        let a = create_clock();
        let b = create_clock();
        let child = create_clock();
        add_clock_child(&a, &child);
        add_clock_child(&b, &child);
        assert!(children_are(&a, &[]));
        assert!(children_are(&b, &[&child]));
        assert!(is_same(&child.read().unwrap().parent, &b));
    }

    #[test]
    fn attaches_a_clock_under_itself_without_deadlocking_as_ts_allows() {
        let clock = create_clock();
        add_clock_child(&clock, &clock);
        assert!(is_same(&clock.read().unwrap().parent, &clock));
        assert!(children_are(&clock, &[&clock]));
        dispose_clock(&clock);
        assert!(clock.read().unwrap().parent.is_none());
        assert!(children_are(&clock, &[]));
    }
}

mod advance_clock {
    use super::*;

    #[test]
    fn sets_delta_time_to_the_real_delta_and_accumulates_elapsed_on_a_realtime_root() {
        let clock = create_clock();
        advance_clock(&clock, 500.0);
        assert_eq!(clock.read().unwrap().delta_time, 500.0);
        assert_eq!(clock.read().unwrap().elapsed, 500.0);
        advance_clock(&clock, 250.0);
        assert_eq!(clock.read().unwrap().delta_time, 250.0);
        assert_eq!(clock.read().unwrap().elapsed, 750.0);
    }

    #[test]
    fn applies_the_local_scale() {
        let clock = clock_with(&options(Some(2.0), None));
        advance_clock(&clock, 1000.0);
        assert_eq!(clock.read().unwrap().delta_time, 2000.0);
        assert_eq!(clock.read().unwrap().elapsed, 2000.0);
    }

    #[test]
    fn feeds_a_zero_delta_while_paused_freezing_elapsed() {
        let clock = clock_with(&options(None, Some(true)));
        advance_clock(&clock, 1000.0);
        assert_eq!(clock.read().unwrap().delta_time, 0.0);
        assert_eq!(clock.read().unwrap().elapsed, 0.0);
    }

    #[test]
    fn composes_scale_down_a_3_level_hierarchy() {
        let grandparent = clock_with(&options(Some(2.0), None));
        let parent = create_child_clock(&grandparent, Some(&options(Some(3.0), None)));
        let child = create_child_clock(&parent, Some(&options(Some(0.5), None)));
        advance_clock(&grandparent, 1000.0);
        assert_eq!(grandparent.read().unwrap().delta_time, 2000.0);
        assert_eq!(parent.read().unwrap().delta_time, 6000.0);
        assert_eq!(child.read().unwrap().delta_time, 3000.0);
        assert_eq!(child.read().unwrap().elapsed, 3000.0);
    }

    #[test]
    fn composes_scale_down_the_hierarchy_a_child_rate_is_the_product_of_the_chain() {
        let parent = clock_with(&options(Some(2.0), None));
        let child = create_child_clock(&parent, Some(&options(Some(0.5), None)));
        advance_clock(&parent, 1000.0);
        assert_eq!(parent.read().unwrap().delta_time, 2000.0);
        assert_eq!(child.read().unwrap().delta_time, 1000.0);
        assert_eq!(child.read().unwrap().elapsed, 1000.0);
    }

    #[test]
    fn freezes_a_subtree_when_an_ancestor_is_paused_even_if_the_child_is_running() {
        let parent = clock_with(&options(None, Some(true)));
        let child = create_child_clock(&parent, None);
        advance_clock(&parent, 1000.0);
        assert_eq!(parent.read().unwrap().delta_time, 0.0);
        assert_eq!(child.read().unwrap().delta_time, 0.0);
        assert_eq!(child.read().unwrap().elapsed, 0.0);
    }

    #[test]
    fn applies_a_negative_delta_time_producing_negative_delta_time_and_decreasing_elapsed() {
        let clock = create_clock();
        advance_clock(&clock, 1000.0);
        assert_eq!(clock.read().unwrap().elapsed, 1000.0);
        advance_clock(&clock, -500.0);
        assert_eq!(clock.read().unwrap().delta_time, -500.0);
        assert_eq!(clock.read().unwrap().elapsed, 500.0);
    }

    #[test]
    fn applies_a_negative_scale_reversing_the_effective_delta_direction() {
        let clock = clock_with(&options(Some(-1.0), None));
        advance_clock(&clock, 1000.0);
        assert_eq!(clock.read().unwrap().delta_time, -1000.0);
        assert_eq!(clock.read().unwrap().elapsed, -1000.0);
    }

}

mod create_child_clock {
    use super::*;

    #[test]
    fn creates_a_clock_attached_to_the_parent() {
        let parent = create_clock();
        let child = create_child_clock(&parent, None);
        assert!(is_same(&child.read().unwrap().parent, &parent));
        assert!(
            parent
                .read()
                .unwrap()
                .children
                .iter()
                .any(|c| Arc::ptr_eq(c, &child))
        );
    }

    #[test]
    fn applies_options_to_the_child() {
        let parent = create_clock();
        let child = create_child_clock(&parent, Some(&options(Some(0.5), Some(true))));
        assert_eq!(child.read().unwrap().scale, 0.5);
        assert!(child.read().unwrap().paused);
    }
}

mod create_clock {
    use super::*;

    #[test]
    fn defaults_to_realtime_running_zeroed_rootless_and_signal_free() {
        let clock = create_clock();
        let clock = clock.read().unwrap();
        assert_eq!(clock.scale, 1.0);
        assert!(!clock.paused);
        assert_eq!(clock.delta_time, 0.0);
        assert_eq!(clock.elapsed, 0.0);
        assert!(clock.parent.is_none());
        assert!(clock.children.is_empty());
        assert!(clock.on_tick.is_none());
    }

    #[test]
    fn takes_scale_and_paused_by_assignment_after_create() {
        // D23 (B): the source's `createClock({ scale: 3, paused: true })` is create, then assign.
        let clock = clock_with(&options(Some(3.0), Some(true)));
        assert_eq!(clock.read().unwrap().scale, 3.0);
        assert!(clock.read().unwrap().paused);
        assert_eq!(clock.read().unwrap().elapsed, 0.0);
    }
}

mod dispose_clock {
    use super::*;

    #[test]
    fn detaches_the_clock_from_its_parent() {
        let parent = create_clock();
        let clock = create_clock();
        add_clock_child(&parent, &clock);
        dispose_clock(&clock);
        assert!(children_are(&parent, &[]));
        assert!(clock.read().unwrap().parent.is_none());
    }

    #[test]
    fn releases_its_children_making_each_a_root() {
        let clock = create_clock();
        let child = create_clock();
        add_clock_child(&clock, &child);
        dispose_clock(&clock);
        assert!(children_are(&clock, &[]));
        assert!(child.read().unwrap().parent.is_none());
    }

    #[test]
    fn is_safe_on_a_rootless_childless_signal_free_clock() {
        let clock = create_clock();
        dispose_clock(&clock);
    }

    #[test]
    fn breaks_the_strong_parent_child_cycle_so_both_clocks_free() {
        let parent = create_clock();
        let child = create_child_clock(&parent, None);
        assert_eq!(Arc::strong_count(&parent), 2);
        assert_eq!(Arc::strong_count(&child), 2);
        dispose_clock(&parent);
        assert_eq!(Arc::strong_count(&parent), 1);
        assert_eq!(Arc::strong_count(&child), 1);
    }
}

mod get_clock_effective_scale {
    use super::*;

    #[test]
    fn returns_the_local_scale_for_a_root() {
        let clock = clock_with(&options(Some(2.0), None));
        assert_eq!(get_clock_effective_scale(&clock.read().unwrap()), 2.0);
    }

    #[test]
    fn multiplies_through_the_ancestor_chain() {
        let a = clock_with(&options(Some(2.0), None));
        let b = create_child_clock(&a, Some(&options(Some(0.5), None)));
        let c = create_child_clock(&b, Some(&options(Some(3.0), None)));
        assert_eq!(get_clock_effective_scale(&c.read().unwrap()), 3.0);
    }
}

mod get_clock_parent {
    use super::*;

    #[test]
    fn returns_none_for_a_root_clock() {
        assert!(get_clock_parent(&create_clock().read().unwrap()).is_none());
    }

    #[test]
    fn returns_the_parent_for_a_child_clock() {
        let parent = create_clock();
        let child = create_child_clock(&parent, None);
        assert!(is_same(&get_clock_parent(&child.read().unwrap()), &parent));
    }
}

mod initialize_clock {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_clock() {
        let mut out: Clock = flight_entity::allocate_entity();
        out.scale = 4.0;
        out.paused = true;
        out.delta_time = 2.0;
        out.elapsed = 9.0;
        initialize_clock(&mut out);
        assert_eq!(out.scale, 1.0);
        assert!(!out.paused);
        assert_eq!((out.delta_time, out.elapsed), (0.0, 0.0));
        assert!(out.parent.is_none() && out.children.is_empty() && out.on_tick.is_none());
    }
}

mod is_clock_effectively_paused {
    use super::*;

    #[test]
    fn is_false_for_a_running_root() {
        assert!(!is_clock_effectively_paused(
            &create_clock().read().unwrap()
        ));
    }

    #[test]
    fn is_true_when_the_clock_itself_is_paused() {
        assert!(is_clock_effectively_paused(
            &clock_with(&options(None, Some(true))).read().unwrap()
        ));
    }

    #[test]
    fn is_true_when_an_ancestor_is_paused_even_if_the_clock_is_running() {
        let parent = clock_with(&options(None, Some(true)));
        let child = create_child_clock(&parent, None);
        assert!(!child.read().unwrap().paused);
        assert!(is_clock_effectively_paused(&child.read().unwrap()));
    }
}

mod pause_clock {
    use super::*;

    #[test]
    fn sets_paused_to_true() {
        let clock = create_clock();
        pause_clock(&mut clock.write().unwrap());
        assert!(clock.read().unwrap().paused);
    }
}

mod remove_clock_child {
    use super::*;

    #[test]
    fn detaches_a_child_and_clears_its_parent() {
        let parent = create_clock();
        let child = create_clock();
        add_clock_child(&parent, &child);
        remove_clock_child(&parent, &child);
        assert!(children_are(&parent, &[]));
        assert!(child.read().unwrap().parent.is_none());
    }

    #[test]
    fn is_a_no_op_when_the_child_is_not_parented_here() {
        let parent = create_clock();
        let child = create_clock();
        remove_clock_child(&parent, &child);
        assert!(children_are(&parent, &[]));
    }
}

mod reset_clock {
    use super::*;

    #[test]
    fn clears_elapsed_and_delta_time_without_touching_scale_or_pause() {
        let clock = clock_with(&options(Some(2.0), None));
        advance_clock(&clock, 1000.0);
        reset_clock(&mut clock.write().unwrap());
        let clock = clock.read().unwrap();
        assert_eq!(clock.elapsed, 0.0);
        assert_eq!(clock.delta_time, 0.0);
        assert_eq!(clock.scale, 2.0);
        assert!(!clock.paused);
    }
}

mod resume_clock {
    use super::*;

    #[test]
    fn sets_paused_to_false() {
        let clock = clock_with(&options(None, Some(true)));
        resume_clock(&mut clock.write().unwrap());
        assert!(!clock.read().unwrap().paused);
    }
}

mod set_clock_scale {
    use super::*;

    #[test]
    fn updates_the_local_scale() {
        let clock = create_clock();
        set_clock_scale(&mut clock.write().unwrap(), 0.25);
        assert_eq!(clock.read().unwrap().scale, 0.25);
    }
}
