use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

use flight_animation::*;
use flight_signals::{connect_signal, SlotFn};

fn player(duration: f32, opts: Option<AnimationPlayerOptions>) -> AnimationPlayer {
    return create_animation_player(
        create_animation_clip(vec![], Some(duration), &[]),
        opts.as_ref(),
    );
}

fn event_player(
    duration: f32,
    times: &[f32],
    opts: Option<AnimationPlayerOptions>,
) -> AnimationPlayer {
    let events: Vec<AnimationClipEvent> = times
        .iter()
        .map(|&time| create_animation_clip_event(time, &time.to_string(), time as usize))
        .collect();
    return create_animation_player(
        create_animation_clip(vec![], Some(duration), &events),
        opts.as_ref(),
    );
}

mod advance_animation_player {
    use super::*;

    #[test]
    fn advances_the_playhead_by_dt_times_speed() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                loop_enabled: Some(false),
                speed: Some(2.0),
                ..Default::default()
            }),
        );
        advance_animation_player(&mut p, 1.0);
        assert_eq!(p.time, 2.0);
    }

    #[test]
    fn wraps_modulo_duration_when_looping() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                loop_enabled: Some(true),
                time: Some(9.0),
                ..Default::default()
            }),
        );
        advance_animation_player(&mut p, 3.0);
        assert!((p.time - 2.0).abs() < 1e-5);
        assert!(p.playing);
    }

    #[test]
    fn clamps_and_stops_at_the_end_when_not_looping() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                loop_enabled: Some(false),
                time: Some(9.0),
                ..Default::default()
            }),
        );
        advance_animation_player(&mut p, 5.0);
        assert_eq!(p.time, 10.0);
        assert!(!p.playing);
    }

    #[test]
    fn is_a_no_op_for_a_zero_duration_clip() {
        let mut p = player(
            0.0,
            Some(AnimationPlayerOptions {
                time: Some(0.0),
                ..Default::default()
            }),
        );
        advance_animation_player(&mut p, 1.0);
        assert_eq!(p.time, 0.0);
    }

    #[test]
    fn is_a_no_op_while_paused() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                playing: Some(false),
                time: Some(3.0),
                ..Default::default()
            }),
        );
        advance_animation_player(&mut p, 5.0);
        assert_eq!(p.time, 3.0);
    }

    #[test]
    fn plays_backward_with_negative_speed() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                speed: Some(-1.0),
                time: Some(5.0),
                ..Default::default()
            }),
        );
        advance_animation_player(&mut p, 1.0);
        assert!((p.time - 4.0).abs() < 1e-5);
    }

    #[test]
    fn stops_at_time_zero_when_playing_backward_without_looping() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                speed: Some(-1.0),
                loop_enabled: Some(false),
                time: Some(0.5),
                ..Default::default()
            }),
        );
        advance_animation_player(&mut p, 2.0);
        assert_eq!(p.time, 0.0);
        assert!(!p.playing);
    }

    #[test]
    fn wraps_backward_when_looping_with_negative_speed() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                speed: Some(-1.0),
                loop_enabled: Some(true),
                time: Some(0.5),
                ..Default::default()
            }),
        );
        advance_animation_player(&mut p, 2.0);
        assert!((p.time - 8.5).abs() < 1e-5);
        assert!(p.playing);
    }

    #[test]
    fn reflects_and_reverses_speed_at_the_end_in_ping_pong_mode() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                loop_mode: Some(AnimationLoopMode::PingPong),
                speed: Some(1.0),
                time: Some(9.0),
                ..Default::default()
            }),
        );
        advance_animation_player(&mut p, 2.0);
        assert!((p.time - 9.0).abs() < 1e-5);
        assert_eq!(p.speed, -1.0);
        assert!(p.playing);
    }

    #[test]
    fn reflects_and_reverses_speed_at_the_start_in_ping_pong_mode() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                loop_mode: Some(AnimationLoopMode::PingPong),
                speed: Some(-1.0),
                time: Some(1.0),
                ..Default::default()
            }),
        );
        advance_animation_player(&mut p, 2.0);
        assert!((p.time - 1.0).abs() < 1e-5);
        assert_eq!(p.speed, 1.0);
        assert!(p.playing);
    }

    #[test]
    fn stops_at_the_end_when_a_finite_repeat_budget_is_exhausted() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                loop_enabled: Some(true),
                repeat_count: Some(0),
                time: Some(9.0),
                ..Default::default()
            }),
        );
        advance_animation_player(&mut p, 2.0);
        assert_eq!(p.time, 10.0);
        assert!(!p.playing);
    }

    #[test]
    fn spends_one_repeat_per_wrap_and_stops_once_the_budget_runs_out() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                loop_enabled: Some(true),
                repeat_count: Some(1),
                time: Some(9.0),
                ..Default::default()
            }),
        );
        advance_animation_player(&mut p, 2.0);
        assert!((p.time - 1.0).abs() < 1e-5);
        assert!(p.playing);
        advance_animation_player(&mut p, 10.0);
        assert!(!p.playing);
    }

    #[test]
    fn emits_on_looped_when_looping_wraps() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                loop_enabled: Some(true),
                time: Some(9.0),
                ..Default::default()
            }),
        );
        enable_animation_player_signals(&mut p);
        let looped = Rc::new(RefCell::new(0i32));
        let looped_clone = looped.clone();
        let slot: SlotFn = Rc::new(move |_: Rc<dyn Any>| {
            *looped_clone.borrow_mut() += 1;
        });
        connect_signal(p.on_looped.as_ref().unwrap(), slot, None);
        advance_animation_player(&mut p, 3.0);
        assert_eq!(*looped.borrow(), 1);
    }

    #[test]
    fn emits_on_finished_when_a_non_looping_run_reaches_the_end() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                loop_enabled: Some(false),
                time: Some(9.0),
                ..Default::default()
            }),
        );
        enable_animation_player_signals(&mut p);
        let finished = Rc::new(RefCell::new(0i32));
        let finished_clone = finished.clone();
        let slot: SlotFn = Rc::new(move |_: Rc<dyn Any>| {
            *finished_clone.borrow_mut() += 1;
        });
        connect_signal(p.on_finished.as_ref().unwrap(), slot, None);
        advance_animation_player(&mut p, 5.0);
        assert_eq!(*finished.borrow(), 1);
    }

    #[test]
    fn emits_crossed_clip_events_in_forward_order() {
        let mut p = event_player(
            10.0,
            &[1.0, 3.0, 7.0],
            Some(AnimationPlayerOptions {
                loop_enabled: Some(false),
                ..Default::default()
            }),
        );
        enable_animation_player_signals(&mut p);
        let crossed = Rc::new(RefCell::new(Vec::<f32>::new()));
        let crossed_clone = crossed.clone();
        let slot: SlotFn = Rc::new(move |args: Rc<dyn Any>| {
            let event = args.downcast_ref::<AnimationClipEvent>().unwrap();
            crossed_clone.borrow_mut().push(event.time);
        });
        connect_signal(p.on_event.as_ref().unwrap(), slot, None);
        advance_animation_player(&mut p, 4.0);
        assert_eq!(*crossed.borrow(), vec![1.0, 3.0]);
    }

    #[test]
    fn emits_time_zero_and_end_markers_once_per_crossed_repeat_boundary() {
        let mut p = event_player(
            10.0,
            &[0.0, 2.0, 10.0],
            Some(AnimationPlayerOptions {
                time: Some(9.0),
                ..Default::default()
            }),
        );
        enable_animation_player_signals(&mut p);
        let crossed = Rc::new(RefCell::new(Vec::<f32>::new()));
        let crossed_clone = crossed.clone();
        let slot: SlotFn = Rc::new(move |args: Rc<dyn Any>| {
            let event = args.downcast_ref::<AnimationClipEvent>().unwrap();
            crossed_clone.borrow_mut().push(event.time);
        });
        connect_signal(p.on_event.as_ref().unwrap(), slot, None);
        advance_animation_player(&mut p, 13.0);
        assert_eq!(*crossed.borrow(), vec![10.0, 0.0, 2.0, 10.0, 0.0, 2.0]);
    }

    #[test]
    fn emits_reverse_crossings_in_reverse_traversal_order() {
        let mut p = event_player(
            10.0,
            &[0.0, 2.0, 8.0, 10.0],
            Some(AnimationPlayerOptions {
                speed: Some(-1.0),
                time: Some(1.0),
                ..Default::default()
            }),
        );
        enable_animation_player_signals(&mut p);
        let crossed = Rc::new(RefCell::new(Vec::<f32>::new()));
        let crossed_clone = crossed.clone();
        let slot: SlotFn = Rc::new(move |args: Rc<dyn Any>| {
            let event = args.downcast_ref::<AnimationClipEvent>().unwrap();
            crossed_clone.borrow_mut().push(event.time);
        });
        connect_signal(p.on_event.as_ref().unwrap(), slot, None);
        advance_animation_player(&mut p, 4.0);
        assert_eq!(*crossed.borrow(), vec![0.0, 10.0, 8.0]);
    }

    #[test]
    fn does_not_double_fire_a_ping_pong_boundary_marker_on_reflection() {
        let mut p = event_player(
            10.0,
            &[8.0, 10.0],
            Some(AnimationPlayerOptions {
                loop_mode: Some(AnimationLoopMode::PingPong),
                time: Some(9.0),
                ..Default::default()
            }),
        );
        enable_animation_player_signals(&mut p);
        let crossed = Rc::new(RefCell::new(Vec::<f32>::new()));
        let crossed_clone = crossed.clone();
        let slot: SlotFn = Rc::new(move |args: Rc<dyn Any>| {
            let event = args.downcast_ref::<AnimationClipEvent>().unwrap();
            crossed_clone.borrow_mut().push(event.time);
        });
        connect_signal(p.on_event.as_ref().unwrap(), slot, None);
        advance_animation_player(&mut p, 3.0);
        assert_eq!(*crossed.borrow(), vec![10.0, 8.0]);
    }
}

mod clone_animation_player {
    use super::*;

    #[test]
    fn copies_fields_shares_the_clip_and_starts_signal_free() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                loop_enabled: Some(false),
                loop_mode: Some(AnimationLoopMode::PingPong),
                repeat_count: Some(3),
                speed: Some(2.0),
                time: Some(4.0),
                ..Default::default()
            }),
        );
        enable_animation_player_signals(&mut p);
        let cloned = clone_animation_player(&p);
        assert!(Rc::ptr_eq(&cloned.clip, &p.clip));
        assert_eq!(cloned.loop_enabled, false);
        assert_eq!(cloned.loop_mode, AnimationLoopMode::PingPong);
        assert_eq!(cloned.repeat_count, 3);
        assert_eq!(cloned.speed, 2.0);
        assert_eq!(cloned.time, 4.0);
        assert!(cloned.on_event.is_none());
        assert!(cloned.on_finished.is_none());
        assert!(cloned.on_looped.is_none());
    }
}

mod create_animation_player_test {
    use super::*;

    #[test]
    fn defaults_to_looping_playing_speed_1_time_0() {
        let p = player(5.0, None);
        assert_eq!(p.loop_enabled, true);
        assert_eq!(p.playing, true);
        assert_eq!(p.speed, 1.0);
        assert_eq!(p.time, 0.0);
    }

    #[test]
    fn defaults_to_repeat_loop_mode_infinite_repeats_and_no_signals() {
        let p = player(5.0, None);
        assert_eq!(p.loop_mode, AnimationLoopMode::Repeat);
        assert_eq!(p.repeat_count, -1);
        assert!(p.on_finished.is_none());
        assert!(p.on_looped.is_none());
        assert!(p.on_event.is_none());
    }
}

mod enable_animation_player_signals_test {
    use super::*;

    #[test]
    fn allocates_the_opt_in_signals() {
        let mut p = player(5.0, None);
        enable_animation_player_signals(&mut p);
        assert!(p.on_finished.is_some());
        assert!(p.on_looped.is_some());
        assert!(p.on_event.is_some());
    }
}

mod get_animation_player_normalized_time {
    use super::*;

    #[test]
    fn returns_time_divided_by_duration_in_0_1() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                time: Some(2.5),
                ..Default::default()
            }),
        );
        assert!((get_animation_player_normalized_time(&p) - 0.25).abs() < 1e-5);
        seek_animation_player(&mut p, 10.0);
        assert_eq!(get_animation_player_normalized_time(&p), 1.0);
    }

    #[test]
    fn returns_zero_for_a_zero_duration_clip() {
        let p = player(0.0, None);
        assert_eq!(get_animation_player_normalized_time(&p), 0.0);
    }
}

mod initialize_animation_player_test {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let _ = initialize_animation_player
            as fn(&mut AnimationPlayer, AnimationClip, Option<&AnimationPlayerOptions>);
    }
}

mod play_animation_player_test {
    use super::*;

    #[test]
    fn sets_playing_true_without_moving_the_playhead() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                playing: Some(false),
                time: Some(3.0),
                ..Default::default()
            }),
        );
        play_animation_player(&mut p);
        assert!(p.playing);
        assert_eq!(p.time, 3.0);
    }
}

mod seek_animation_player_test {
    use super::*;

    #[test]
    fn clamps_the_playhead_to_0_duration() {
        let mut p = player(10.0, None);
        seek_animation_player(&mut p, 4.0);
        assert_eq!(p.time, 4.0);
        seek_animation_player(&mut p, -1.0);
        assert_eq!(p.time, 0.0);
        seek_animation_player(&mut p, 99.0);
        assert_eq!(p.time, 10.0);
    }
}

mod stop_animation_player_test {
    use super::*;

    #[test]
    fn clears_playing_and_rewinds_to_zero() {
        let mut p = player(
            10.0,
            Some(AnimationPlayerOptions {
                time: Some(5.0),
                ..Default::default()
            }),
        );
        stop_animation_player(&mut p);
        assert!(!p.playing);
        assert_eq!(p.time, 0.0);
    }
}
