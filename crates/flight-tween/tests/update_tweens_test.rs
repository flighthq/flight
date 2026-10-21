use std::sync::{Arc, Mutex, RwLock};

use flight_entity::Ref;
use flight_signals::connect_signal;
use flight_tween::*;

fn linear_ease(t: f32) -> f32 {
    return t;
}

struct Obj {
    x: f32,
}

struct ObjXY {
    x: f32,
    y: f32,
}

struct RotObj {
    rotation: f32,
}

mod complete_tween {
    use super::*;

    #[test]
    fn jumps_target_to_end_value_and_marks_tween_complete() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                delay: None,
                ease: Some(linear_ease),
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        complete_tween(&tween);
        assert_eq!(target.read().unwrap().x, 100.0);
        assert!(tween.is_complete());
    }

    #[test]
    fn emits_on_complete() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            None,
        );
        let fired = Arc::new(Mutex::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &tween.on_complete(),
            Arc::new(move |_: &()| {
                *fired_c.lock().unwrap() += 1;
            }),
            None,
        );
        complete_tween(&tween);
        assert_eq!(*fired.lock().unwrap(), 1);
    }

    #[test]
    fn works_on_an_uninitialized_tween_before_first_update() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 25.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        assert!(!tween.is_initialized());
        complete_tween(&tween);
        assert_eq!(target.read().unwrap().x, 100.0);
    }

    #[test]
    fn lands_on_start_value_when_reverse_is_true() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                reverse: Some(true),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        complete_tween(&tween);
        assert_eq!(target.read().unwrap().x, 0.0);
        assert!(tween.is_complete());
    }

    #[test]
    fn is_a_no_op_on_an_already_complete_tween() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        complete_tween(&tween);
        target.write().unwrap().x = 0.0;
        complete_tween(&tween);
        assert_eq!(target.read().unwrap().x, 0.0);
    }
}

mod smart_rotation {
    use super::*;

    #[test]
    fn takes_the_short_path_for_a_large_positive_delta() {
        let manager = create_tween_manager(None);
        let target: Ref<RotObj> = Ref::new(RwLock::new(RotObj { rotation: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut RotObj| &mut t.rotation,
                key: "rotation",
                to: 350.0,
            }],
            Some(&TweenOptions {
                delay: None,
                ease: Some(linear_ease),
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: Some(true),
                snapping: None,
            }),
        );
        update_tweens(&manager, 500.0);
        assert!((target.read().unwrap().rotation - (-5.0)).abs() < 0.01);
    }

    #[test]
    fn takes_the_short_path_for_a_large_negative_delta() {
        let manager = create_tween_manager(None);
        let target: Ref<RotObj> = Ref::new(RwLock::new(RotObj { rotation: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut RotObj| &mut t.rotation,
                key: "rotation",
                to: -350.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                smart_rotation: Some(true),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 500.0);
        assert!((target.read().unwrap().rotation - 5.0).abs() < 0.01);
    }

    #[test]
    fn finds_the_short_path_when_starting_from_a_non_zero_angle() {
        let manager = create_tween_manager(None);
        let target: Ref<RotObj> = Ref::new(RwLock::new(RotObj { rotation: 350.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut RotObj| &mut t.rotation,
                key: "rotation",
                to: 10.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                smart_rotation: Some(true),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 500.0);
        assert!((target.read().unwrap().rotation - 360.0).abs() < 0.01);
        update_tweens(&manager, 500.0);
        assert!((target.read().unwrap().rotation - 370.0).abs() < 0.01);
    }

    #[test]
    fn leaves_small_deltas_unchanged() {
        let manager = create_tween_manager(None);
        let target: Ref<RotObj> = Ref::new(RwLock::new(RotObj { rotation: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut RotObj| &mut t.rotation,
                key: "rotation",
                to: 90.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                smart_rotation: Some(true),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 500.0);
        assert!((target.read().unwrap().rotation - 45.0).abs() < 0.01);
    }
}

mod update_tweens {
    use super::*;

    #[test]
    fn interpolates_property_toward_target_value() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                delay: None,
                ease: Some(linear_ease),
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 500.0);
        assert!((target.read().unwrap().x - 50.0).abs() < 0.01);
    }

    #[test]
    fn reaches_target_value_at_end_of_duration() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(target.read().unwrap().x, 100.0);
    }

    #[test]
    fn animates_multiple_properties_independently_to_their_respective_targets() {
        let manager = create_tween_manager(None);
        let target: Ref<ObjXY> = Ref::new(RwLock::new(ObjXY { x: 0.0, y: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[
                TweenProp {
                    get: |t: &mut ObjXY| &mut t.x,
                    key: "x",
                    to: 100.0,
                },
                TweenProp {
                    get: |t: &mut ObjXY| &mut t.y,
                    key: "y",
                    to: 200.0,
                },
            ],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(target.read().unwrap().x, 100.0);
        assert_eq!(target.read().unwrap().y, 200.0);
    }

    #[test]
    fn marks_tween_complete_after_duration() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            None,
        );
        update_tweens(&manager, 1000.0);
        assert!(tween.is_complete());
    }

    #[test]
    fn removes_completed_tweens_from_manager() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 0.0);
        assert!(!has_tweens_of(&manager, &target));
    }

    #[test]
    fn emits_on_complete_when_finished() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            None,
        );
        let fired = Arc::new(Mutex::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &tween.on_complete(),
            Arc::new(move |_: &()| {
                *fired_c.lock().unwrap() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(*fired.lock().unwrap(), 1);
    }

    #[test]
    fn emits_on_update_each_tick() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            None,
        );
        let updates = Arc::new(Mutex::new(0i32));
        let updates_c = updates.clone();
        connect_signal(
            &tween.on_update(),
            Arc::new(move |_: &()| {
                *updates_c.lock().unwrap() += 1;
            }),
            None,
        );
        update_tweens(&manager, 250.0);
        update_tweens(&manager, 250.0);
        assert_eq!(*updates.lock().unwrap(), 2);
    }

    #[test]
    fn respects_delay_before_starting() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: Some(500.0),
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 500.0);
        assert_eq!(target.read().unwrap().x, 0.0);
        update_tweens(&manager, 500.0);
        assert!((target.read().unwrap().x - 50.0).abs() < 0.01);
    }

    #[test]
    fn repeats_the_specified_number_of_times() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                repeat: Some(2),
                delay: None,
                overwrite: None,
                reflect: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        let repeats = Arc::new(Mutex::new(0i32));
        let repeats_c = repeats.clone();
        connect_signal(
            &tween.on_repeat(),
            Arc::new(move |_: &()| {
                *repeats_c.lock().unwrap() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        assert_eq!(*repeats.lock().unwrap(), 2);
        assert!(tween.is_complete());
    }

    #[test]
    fn reverse_true_animates_from_end_value_back_to_start() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                reverse: Some(true),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 100.0);
        assert!((target.read().unwrap().x - 90.0).abs() < 0.01);
        update_tweens(&manager, 900.0);
        assert_eq!(target.read().unwrap().x, 0.0);
    }

    #[test]
    fn reflect_reverses_direction_on_each_repeat_arriving_back_at_start() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                repeat: Some(1),
                reflect: Some(true),
                delay: None,
                overwrite: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(target.read().unwrap().x, 100.0);
        update_tweens(&manager, 250.0);
        assert!((target.read().unwrap().x - 75.0).abs() < 0.01);
        update_tweens(&manager, 750.0);
        assert_eq!(target.read().unwrap().x, 0.0);
    }

    #[test]
    fn emits_on_yoyo_on_direction_flip_with_reflect() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                repeat: Some(1),
                reflect: Some(true),
                delay: None,
                overwrite: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        let yoyos = Arc::new(Mutex::new(0i32));
        let yoyos_c = yoyos.clone();
        connect_signal(
            &tween.on_yoyo(),
            Arc::new(move |_: &()| {
                *yoyos_c.lock().unwrap() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(*yoyos.lock().unwrap(), 1);
    }

    #[test]
    fn does_not_emit_on_yoyo_without_reflect() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                repeat: Some(1),
                delay: None,
                overwrite: None,
                reflect: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        let yoyos = Arc::new(Mutex::new(0i32));
        let yoyos_c = yoyos.clone();
        connect_signal(
            &tween.on_yoyo(),
            Arc::new(move |_: &()| {
                *yoyos_c.lock().unwrap() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        assert_eq!(*yoyos.lock().unwrap(), 0);
    }

    #[test]
    fn emits_on_yoyo_each_reflect_cycle() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                repeat: Some(3),
                reflect: Some(true),
                delay: None,
                overwrite: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        let yoyos = Arc::new(Mutex::new(0i32));
        let yoyos_c = yoyos.clone();
        connect_signal(
            &tween.on_yoyo(),
            Arc::new(move |_: &()| {
                *yoyos_c.lock().unwrap() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        assert_eq!(*yoyos.lock().unwrap(), 3);
    }

    #[test]
    fn repeat_negative_one_loops_indefinitely_without_completing() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                repeat: Some(-1),
                delay: None,
                overwrite: None,
                reflect: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        let repeats = Arc::new(Mutex::new(0i32));
        let repeats_c = repeats.clone();
        connect_signal(
            &tween.on_repeat(),
            Arc::new(move |_: &()| {
                *repeats_c.lock().unwrap() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        assert_eq!(*repeats.lock().unwrap(), 3);
        assert!(!tween.is_complete());
        assert_eq!(tween.repeat(), -1);
    }

    #[test]
    fn rounds_values_when_snapping_is_true() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                snapping: Some(true),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
            }),
        );
        update_tweens(&manager, 333.0);
        let x = target.read().unwrap().x;
        assert_eq!(x, x.round());
    }

    #[test]
    fn does_not_update_paused_tween() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        pause_tween(&tween);
        update_tweens(&manager, 500.0);
        assert_eq!(target.read().unwrap().x, 0.0);
    }

    #[test]
    fn resumes_after_pause() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        pause_tween(&tween);
        update_tweens(&manager, 500.0);
        resume_tween(&tween);
        update_tweens(&manager, 500.0);
        assert!((target.read().unwrap().x - 50.0).abs() < 0.01);
    }

    #[test]
    fn elapsed_does_not_accumulate_while_paused() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        pause_tween(&tween);
        update_tweens(&manager, 500.0);
        assert_eq!(tween.elapsed(), 0.0);
        resume_tween(&tween);
        update_tweens(&manager, 500.0);
        assert!((target.read().unwrap().x - 50.0).abs() < 0.01);
    }

    #[test]
    fn handles_negative_delta_time_without_advancing() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 500.0);
        assert!((target.read().unwrap().x - 50.0).abs() < 0.01);
        update_tweens(&manager, -200.0);
        let x = target.read().unwrap().x;
        assert!(x.is_finite());
    }

    #[test]
    fn handles_zero_duration_tween_without_nan() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            0.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 1.0);
        assert_eq!(target.read().unwrap().x, 100.0);
        assert!(tween.is_complete());
        assert!(target.read().unwrap().x.is_finite());
    }
}
