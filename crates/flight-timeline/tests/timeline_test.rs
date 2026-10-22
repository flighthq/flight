use std::sync::{Arc, Mutex};

use flight_scene2d::contract::{Node2DRef, create_display_object};
use flight_signals::connect_signal;
use flight_timeline::contract::*;

struct MakeOptions {
    total_frames: Option<i32>,
    frame_rate: Option<Option<f64>>,
    labels: Option<Arc<Vec<TimelineLabel>>>,
    construct_frames: Option<Arc<Mutex<Vec<i32>>>>,
    current_frame: Option<i32>,
    is_playing: Option<bool>,
}

impl Default for MakeOptions {
    fn default() -> Self {
        return MakeOptions {
            total_frames: None,
            frame_rate: None,
            labels: None,
            construct_frames: None,
            current_frame: None,
            is_playing: None,
        };
    }
}

fn make_options() -> MakeOptions {
    return MakeOptions {
        total_frames: None,
        frame_rate: None,
        labels: None,
        construct_frames: None,
        current_frame: None,
        is_playing: None,
    };
}

fn timeline_options() -> TimelineOptions {
    return TimelineOptions {
        source: None,
        target: None,
        cue_registry: None,
        current_frame: None,
        frame_scripts: None,
        is_playing: None,
        play_mode: None,
        signals: None,
    };
}

fn source_options() -> TimelineSourceOptions {
    return TimelineSourceOptions {
        total_frames: None,
        frame_rate: None,
        labels: None,
        cues: None,
        construct_frame: None,
    };
}

fn target() -> Node2DRef {
    return create_display_object();
}

fn make(options: MakeOptions) -> TimelineRef {
    let total_frames = options.total_frames.unwrap_or(4);
    let frame_rate = match options.frame_rate {
        Some(rate) => rate,
        None => Some(10.0),
    };
    let construct_frame: Option<FrameConstruct> = options.construct_frames.as_ref().map(|frames| {
        let frames = frames.clone();
        return Arc::new(move |_target: &Node2DRef, frame: i32| {
            frames.lock().unwrap().push(frame);
        }) as FrameConstruct;
    });
    return create_timeline(Some(&TimelineOptions {
        source: Some(create_timeline_source(Some(&TimelineSourceOptions {
            total_frames: Some(total_frames),
            frame_rate,
            labels: options.labels,
            cues: None,
            construct_frame,
        }))),
        target: Some(target()),
        cue_registry: None,
        current_frame: options.current_frame,
        frame_scripts: None,
        is_playing: options.is_playing,
        play_mode: None,
        signals: None,
    }));
}

fn frame(frame: i32) -> TimelineFrameArg {
    return TimelineFrameArg::Frame(frame);
}

fn label(name: &str) -> TimelineFrameArg {
    return TimelineFrameArg::Label(String::from(name));
}

fn script_for(log: Arc<Mutex<Vec<i32>>>) -> FrameScript {
    return Arc::new(move |_target: &Node2DRef, frame: i32| {
        log.lock().unwrap().push(frame);
    });
}

mod add_timeline_frame_script {
    use super::*;

    #[test]
    fn attaches_a_script_that_fires_once_on_frame_entry() {
        let fired = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            frame_rate: Some(None),
            ..make_options()
        });
        add_timeline_frame_script(&t, &frame(2), script_for(fired.clone()));
        play_timeline(&t);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        assert_eq!(*fired.lock().unwrap(), vec![2]);
    }

    #[test]
    fn does_not_re_fire_on_repeated_updates_to_the_same_stopped_frame() {
        let fired = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            frame_rate: Some(None),
            ..make_options()
        });
        add_timeline_frame_script(&t, &frame(2), script_for(fired.clone()));
        play_timeline(&t);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        stop_timeline(&t);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        assert_eq!(*fired.lock().unwrap(), vec![2]);
    }

    #[test]
    fn accepts_a_label_string_as_the_frame_argument() {
        let fired = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            frame_rate: Some(None),
            labels: Some(Arc::new(vec![TimelineLabel {
                frame: 3,
                name: String::from("run"),
            }])),
            ..make_options()
        });
        add_timeline_frame_script(&t, &label("run"), script_for(fired.clone()));
        goto_and_stop_timeline(&t, &frame(3));
        assert_eq!(*fired.lock().unwrap(), vec![3]);
    }
}

mod clear_timeline_frame_scripts {
    use super::*;

    #[test]
    fn is_an_idempotent_noop_when_no_scripts_are_attached() {
        let t = make(make_options());
        clear_timeline_frame_scripts(&t);
        assert!(t.read().unwrap().frame_scripts.is_none());
    }

    #[test]
    fn clears_every_attached_script_and_restores_the_null_sentinel() {
        let t = make(make_options());
        add_timeline_frame_script(&t, &frame(1), script_for(Arc::new(Mutex::new(Vec::new()))));
        add_timeline_frame_script(&t, &frame(3), script_for(Arc::new(Mutex::new(Vec::new()))));
        clear_timeline_frame_scripts(&t);
        assert!(t.read().unwrap().frame_scripts.is_none());
        let mut frames = Vec::new();
        get_timeline_frame_script_frames(&mut frames, &t);
        assert_eq!(frames, Vec::<i32>::new());
        assert!(get_timeline_frame_script(&t, &frame(1)).is_none());
        assert!(get_timeline_frame_script(&t, &frame(3)).is_none());
    }
}

mod create_timeline {
    use super::*;

    #[test]
    fn starts_at_frame_1_stopped_with_last_frame_update_minus_1() {
        let t = make(make_options());
        let guard = t.read().unwrap();
        assert_eq!(guard.current_frame, 1);
        assert!(!guard.is_playing);
        assert_eq!(guard.last_frame_update, -1);
    }

    #[test]
    fn defaults_play_mode_to_loop() {
        let t = make(make_options());
        assert_eq!(t.read().unwrap().play_mode, TimelinePlayMode::Loop);
    }

    #[test]
    fn defaults_frame_scripts_to_null() {
        let t = make(make_options());
        assert!(t.read().unwrap().frame_scripts.is_none());
    }

    #[test]
    fn defaults_signals_to_null() {
        let t = make(make_options());
        assert!(t.read().unwrap().signals.is_none());
    }

    #[test]
    fn applies_overrides() {
        let t = make(MakeOptions {
            current_frame: Some(3),
            frame_rate: Some(Some(24.0)),
            ..make_options()
        });
        assert_eq!(t.read().unwrap().current_frame, 3);
        assert_eq!(
            t.read()
                .unwrap()
                .source
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .frame_rate,
            Some(24.0)
        );
    }
}

mod create_timeline_source {
    use super::*;

    #[test]
    fn builds_a_source_with_defaults() {
        let source = create_timeline_source(None);
        let guard = source.read().unwrap();
        assert_eq!(guard.total_frames, 1);
        assert_eq!(guard.frame_rate, None);
        assert!(guard.labels.is_empty());
    }

    #[test]
    fn carries_provided_fields_and_invokes_construct_frame_with_target_and_frame() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let seen_construct = seen.clone();
        let source = create_timeline_source(Some(&TimelineSourceOptions {
            total_frames: Some(3),
            frame_rate: Some(12.0),
            labels: Some(Arc::new(vec![TimelineLabel {
                frame: 2,
                name: String::from("a"),
            }])),
            cues: None,
            construct_frame: Some(Arc::new(move |_target: &Node2DRef, frame: i32| {
                seen_construct.lock().unwrap().push(frame);
            })),
        }));
        let guard = source.read().unwrap();
        assert_eq!(guard.total_frames, 3);
        assert_eq!(guard.frame_rate, Some(12.0));
        assert_eq!(guard.labels.as_ref()[0].name, "a");
        (guard.construct_frame)(&target(), 2);
        assert_eq!(*seen.lock().unwrap(), vec![2]);
    }
}

mod dispose_timeline_signals {
    use super::*;

    #[test]
    fn clears_the_signal_group_to_null() {
        let t = make(make_options());
        enable_timeline_signals(&t);
        assert!(t.read().unwrap().signals.is_some());
        dispose_timeline_signals(&t);
        assert!(t.read().unwrap().signals.is_none());
    }

    #[test]
    fn is_idempotent_when_signals_are_already_null() {
        let t = make(make_options());
        dispose_timeline_signals(&t);
        assert!(t.read().unwrap().signals.is_none());
    }

    #[test]
    fn allows_enable_to_rearm_after_dispose() {
        let t = make(make_options());
        let first = enable_timeline_signals(&t);
        dispose_timeline_signals(&t);
        let second = enable_timeline_signals(&t);
        assert!(!Arc::ptr_eq(&first, &second));
        assert!(Arc::ptr_eq(
            t.read().unwrap().signals.as_ref().unwrap(),
            &second
        ));
    }
}

mod enable_timeline_signals {
    use super::*;
    use flight_signals::emit_signal;

    #[test]
    fn returns_a_group_with_every_lifecycle_signal() {
        let t = make(make_options());
        let signals = enable_timeline_signals(&t);
        let guard = signals.read().unwrap();
        emit_signal(
            &guard.on_enter_frame,
            &TimelineFrameEvent {
                frame: 0,
                previous_frame: -1,
            },
        );
        emit_signal(
            &guard.on_exit_frame,
            &TimelineFrameEvent {
                frame: 0,
                previous_frame: -1,
            },
        );
        emit_signal(
            &guard.on_frame_constructed,
            &TimelineFrameEvent {
                frame: 0,
                previous_frame: -1,
            },
        );
        emit_signal(&guard.on_complete, &());
        emit_signal(&guard.on_loop, &());
    }

    #[test]
    fn is_idempotent_and_returns_the_same_group() {
        let t = make(make_options());
        assert!(Arc::ptr_eq(
            &enable_timeline_signals(&t),
            &enable_timeline_signals(&t)
        ));
    }

    #[test]
    fn stores_the_group_on_the_timeline() {
        let t = make(make_options());
        let signals = enable_timeline_signals(&t);
        assert!(Arc::ptr_eq(
            t.read().unwrap().signals.as_ref().unwrap(),
            &signals
        ));
    }

    #[test]
    fn emits_on_enter_frame_with_correct_frame_and_previous_frame() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            frame_rate: Some(None),
            ..make_options()
        });
        let signals = enable_timeline_signals(&t);
        let recorded = events.clone();
        connect_signal(
            &signals.read().unwrap().on_enter_frame,
            Arc::new(move |event: &TimelineFrameEvent| {
                recorded
                    .lock()
                    .unwrap()
                    .push((event.frame, event.previous_frame));
            }),
            None,
        );
        play_timeline(&t);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        let events = events.lock().unwrap();
        assert_eq!(events[0].0, 1);
        assert_eq!(events[1].0, 2);
        assert_eq!(events[1].1, 1);
    }

    #[test]
    fn emits_on_exit_frame_before_the_frame_changes() {
        let order = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            frame_rate: Some(None),
            ..make_options()
        });
        let signals = enable_timeline_signals(&t);
        for (name, signal) in [
            ("exit", signals.read().unwrap().on_exit_frame.clone()),
            ("enter", signals.read().unwrap().on_enter_frame.clone()),
            (
                "constructed",
                signals.read().unwrap().on_frame_constructed.clone(),
            ),
        ] {
            let order = order.clone();
            connect_signal(
                &signal,
                Arc::new(move |_event: &TimelineFrameEvent| {
                    order.lock().unwrap().push(String::from(name));
                }),
                None,
            );
        }
        play_timeline(&t);
        update_timeline(&t, 0.0);
        assert_eq!(*order.lock().unwrap(), vec!["exit", "enter", "constructed"]);
    }

    #[test]
    fn emits_on_loop_when_the_timeline_wraps() {
        let looped = Arc::new(Mutex::new(false));
        let t = make(MakeOptions {
            total_frames: Some(2),
            frame_rate: Some(None),
            ..make_options()
        });
        let signals = enable_timeline_signals(&t);
        let recorded = looped.clone();
        connect_signal(
            &signals.read().unwrap().on_loop,
            Arc::new(move |_value: &()| {
                *recorded.lock().unwrap() = true;
            }),
            None,
        );
        play_timeline(&t);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        assert!(*looped.lock().unwrap());
    }

    #[test]
    fn emits_on_complete_and_stops_in_once_mode() {
        let completed = Arc::new(Mutex::new(false));
        let t = make(MakeOptions {
            total_frames: Some(2),
            frame_rate: Some(None),
            ..make_options()
        });
        t.write().unwrap().play_mode = TimelinePlayMode::Once;
        let signals = enable_timeline_signals(&t);
        let recorded = completed.clone();
        connect_signal(
            &signals.read().unwrap().on_complete,
            Arc::new(move |_value: &()| {
                *recorded.lock().unwrap() = true;
            }),
            None,
        );
        play_timeline(&t);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        assert!(*completed.lock().unwrap());
        assert!(!t.read().unwrap().is_playing);
    }
}

mod find_timeline_label {
    use super::*;

    #[test]
    fn returns_the_matching_label() {
        let t = make(MakeOptions {
            labels: Some(Arc::new(vec![
                TimelineLabel {
                    frame: 1,
                    name: String::from("idle"),
                },
                TimelineLabel {
                    frame: 3,
                    name: String::from("run"),
                },
            ])),
            ..make_options()
        });
        assert_eq!(find_timeline_label(&t, "run").unwrap().frame, 3);
    }

    #[test]
    fn returns_none_for_an_unknown_name() {
        let t = make(make_options());
        assert!(find_timeline_label(&t, "missing").is_none());
    }
}

mod get_timeline_current_label {
    use super::*;

    #[test]
    fn returns_none_when_there_are_no_labels() {
        let t = make(make_options());
        assert!(get_timeline_current_label(&t).is_none());
    }

    #[test]
    fn returns_none_when_no_label_precedes_the_current_frame() {
        let t = make(MakeOptions {
            labels: Some(Arc::new(vec![TimelineLabel {
                frame: 3,
                name: String::from("run"),
            }])),
            current_frame: Some(1),
            ..make_options()
        });
        assert!(get_timeline_current_label(&t).is_none());
    }

    #[test]
    fn returns_the_label_exactly_at_the_current_frame() {
        let t = make(MakeOptions {
            labels: Some(Arc::new(vec![TimelineLabel {
                frame: 3,
                name: String::from("run"),
            }])),
            current_frame: Some(3),
            ..make_options()
        });
        assert_eq!(get_timeline_current_label(&t).unwrap().name, "run");
    }

    #[test]
    fn returns_the_last_label_at_or_before_the_current_frame() {
        let t = make(MakeOptions {
            total_frames: Some(6),
            labels: Some(Arc::new(vec![
                TimelineLabel {
                    frame: 1,
                    name: String::from("idle"),
                },
                TimelineLabel {
                    frame: 3,
                    name: String::from("run"),
                },
            ])),
            current_frame: Some(4),
            ..make_options()
        });
        assert_eq!(get_timeline_current_label(&t).unwrap().name, "run");
    }
}

mod get_timeline_frame_script {
    use super::*;

    #[test]
    fn returns_none_when_no_scripts_are_attached() {
        let t = make(make_options());
        assert!(get_timeline_frame_script(&t, &frame(1)).is_none());
    }

    #[test]
    fn returns_none_for_a_frame_without_a_script_when_others_exist() {
        let t = make(make_options());
        add_timeline_frame_script(&t, &frame(2), script_for(Arc::new(Mutex::new(Vec::new()))));
        assert!(get_timeline_frame_script(&t, &frame(1)).is_none());
    }

    #[test]
    fn returns_the_script_attached_to_a_frame_with_identity() {
        let t = make(make_options());
        let script = script_for(Arc::new(Mutex::new(Vec::new())));
        add_timeline_frame_script(&t, &frame(3), script.clone());
        assert!(Arc::ptr_eq(
            &get_timeline_frame_script(&t, &frame(3)).unwrap(),
            &script
        ));
    }
}

mod get_timeline_frame_script_frames {
    use super::*;

    #[test]
    fn returns_an_empty_list_when_no_scripts_are_attached() {
        let mut frames = Vec::new();
        get_timeline_frame_script_frames(&mut frames, &make(make_options()));
        assert!(frames.is_empty());
    }

    #[test]
    fn returns_a_snapshot_in_insertion_order() {
        let t = make(make_options());
        add_timeline_frame_script(&t, &frame(3), script_for(Arc::new(Mutex::new(Vec::new()))));
        add_timeline_frame_script(&t, &frame(1), script_for(Arc::new(Mutex::new(Vec::new()))));
        let mut frames = Vec::new();
        get_timeline_frame_script_frames(&mut frames, &t);
        assert_eq!(frames, vec![3, 1]);
        frames.push(2);
        get_timeline_frame_script_frames(&mut frames, &t);
        assert_eq!(frames, vec![3, 1]);
    }
}

mod get_timeline_labels {
    use super::*;

    #[test]
    fn returns_an_empty_list_when_the_timeline_has_no_labels() {
        assert!(get_timeline_labels(&create_timeline(None)).is_empty());
    }

    #[test]
    fn returns_the_source_label_list_with_identity() {
        let labels = Arc::new(vec![
            TimelineLabel {
                frame: 1,
                name: String::from("idle"),
            },
            TimelineLabel {
                frame: 3,
                name: String::from("run"),
            },
        ]);
        let t = make(MakeOptions {
            labels: Some(labels.clone()),
            ..make_options()
        });
        assert!(Arc::ptr_eq(&get_timeline_labels(&t), &labels));
    }
}

mod goto_and_play_timeline {
    use super::*;

    #[test]
    fn seeks_to_frame_and_starts_playing() {
        let t = make(make_options());
        goto_and_play_timeline(&t, &frame(3));
        assert_eq!(t.read().unwrap().current_frame, 3);
        assert!(t.read().unwrap().is_playing);
    }

    #[test]
    fn fires_construct_frame_immediately_for_the_target_frame() {
        let frames = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            construct_frames: Some(frames.clone()),
            ..make_options()
        });
        goto_and_play_timeline(&t, &frame(3));
        assert_eq!(*frames.lock().unwrap(), vec![3]);
    }

    #[test]
    fn resolves_a_label_name_to_a_frame_number() {
        let t = make(MakeOptions {
            labels: Some(Arc::new(vec![TimelineLabel {
                frame: 2,
                name: String::from("run"),
            }])),
            ..make_options()
        });
        goto_and_play_timeline(&t, &label("run"));
        assert_eq!(t.read().unwrap().current_frame, 2);
        assert!(t.read().unwrap().is_playing);
    }

    #[test]
    #[should_panic(expected = "Frame label \"missing\" not found")]
    fn throws_for_an_unknown_label() {
        let t = make(make_options());
        goto_and_play_timeline(&t, &label("missing"));
    }
}

mod goto_and_stop_timeline {
    use super::*;

    #[test]
    fn seeks_to_frame_and_stops() {
        let t = make(make_options());
        play_timeline(&t);
        goto_and_stop_timeline(&t, &frame(2));
        assert_eq!(t.read().unwrap().current_frame, 2);
        assert!(!t.read().unwrap().is_playing);
    }

    #[test]
    fn clamps_the_frame_to_the_valid_range() {
        let t = make(MakeOptions {
            total_frames: Some(4),
            ..make_options()
        });
        goto_and_stop_timeline(&t, &frame(99));
        assert_eq!(t.read().unwrap().current_frame, 4);
        goto_and_stop_timeline(&t, &frame(0));
        assert_eq!(t.read().unwrap().current_frame, 1);
    }
}

mod initialize_timeline {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_timeline() {
        let mut out = flight_entity::allocate_entity::<Timeline>();
        initialize_timeline(&mut out, None);
        let mut created: Timeline = flight_entity::allocate_entity();
        initialize_timeline(&mut created, None);
        assert_eq!(out.current_frame, created.current_frame);
        assert_eq!(out.last_frame_update, created.last_frame_update);
        assert_eq!(out.play_mode, created.play_mode);
    }
}

mod initialize_timeline_source {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_timeline_source() {
        let mut out = flight_entity::allocate_entity::<TimelineSource>();
        initialize_timeline_source(&mut out, None);
        let created = create_timeline_source(None);
        assert_eq!(out.total_frames, created.read().unwrap().total_frames);
        assert_eq!(out.frame_rate, created.read().unwrap().frame_rate);
    }
}

mod next_frame_timeline {
    use super::*;

    #[test]
    fn advances_one_frame_and_stops() {
        let t = make(make_options());
        play_timeline(&t);
        next_frame_timeline(&t);
        assert_eq!(t.read().unwrap().current_frame, 2);
        assert!(!t.read().unwrap().is_playing);
    }

    #[test]
    fn clamps_at_the_last_frame() {
        let t = make(MakeOptions {
            total_frames: Some(4),
            ..make_options()
        });
        goto_and_stop_timeline(&t, &frame(4));
        next_frame_timeline(&t);
        assert_eq!(t.read().unwrap().current_frame, 4);
    }
}

mod play_timeline {
    use super::*;

    #[test]
    fn sets_is_playing_true() {
        let t = make(make_options());
        play_timeline(&t);
        assert!(t.read().unwrap().is_playing);
    }

    #[test]
    fn does_nothing_when_total_frames_is_less_than_two() {
        let t = create_timeline(Some(&TimelineOptions {
            source: Some(create_timeline_source(Some(&TimelineSourceOptions {
                total_frames: Some(1),
                ..source_options()
            }))),
            ..timeline_options()
        }));
        play_timeline(&t);
        assert!(!t.read().unwrap().is_playing);
    }

    #[test]
    fn resets_time_elapsed_on_play() {
        let t = make(make_options());
        t.write().unwrap().time_elapsed = 999.0;
        play_timeline(&t);
        assert_eq!(t.read().unwrap().time_elapsed, 0.0);
    }
}

mod prev_frame_timeline {
    use super::*;

    #[test]
    fn retreats_one_frame_and_stops() {
        let t = make(make_options());
        goto_and_stop_timeline(&t, &frame(3));
        prev_frame_timeline(&t);
        assert_eq!(t.read().unwrap().current_frame, 2);
        assert!(!t.read().unwrap().is_playing);
    }

    #[test]
    fn clamps_at_frame_1() {
        let t = make(make_options());
        prev_frame_timeline(&t);
        assert_eq!(t.read().unwrap().current_frame, 1);
    }
}

mod remove_timeline_frame_script {
    use super::*;

    #[test]
    fn is_a_noop_when_no_scripts_are_attached() {
        let t = make(make_options());
        remove_timeline_frame_script(&t, &frame(2));
        assert!(t.read().unwrap().frame_scripts.is_none());
    }

    #[test]
    fn removes_the_script_so_it_no_longer_fires() {
        let fired = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            frame_rate: Some(None),
            ..make_options()
        });
        add_timeline_frame_script(&t, &frame(2), script_for(fired.clone()));
        remove_timeline_frame_script(&t, &frame(2));
        play_timeline(&t);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        assert!(*fired.lock().unwrap() == Vec::<i32>::new());
    }

    #[test]
    fn clears_the_store_to_null_when_the_last_script_is_removed() {
        let t = make(make_options());
        add_timeline_frame_script(&t, &frame(2), script_for(Arc::new(Mutex::new(Vec::new()))));
        remove_timeline_frame_script(&t, &frame(2));
        assert!(t.read().unwrap().frame_scripts.is_none());
    }
}

mod stop_timeline {
    use super::*;

    #[test]
    fn sets_is_playing_false() {
        let t = make(make_options());
        play_timeline(&t);
        stop_timeline(&t);
        assert!(!t.read().unwrap().is_playing);
    }
}

mod update_timeline {
    use super::*;

    #[test]
    fn fires_construct_frame_for_frame_1_on_first_update_even_when_stopped() {
        let frames = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            construct_frames: Some(frames.clone()),
            ..make_options()
        });
        assert!(update_timeline(&t, 0.0));
        assert_eq!(*frames.lock().unwrap(), vec![1]);
    }

    #[test]
    fn does_not_double_fire_construct_frame_on_repeated_stopped_updates() {
        let frames = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            construct_frames: Some(frames.clone()),
            ..make_options()
        });
        assert!(update_timeline(&t, 0.0));
        assert!(!update_timeline(&t, 0.0));
        assert_eq!(*frames.lock().unwrap(), vec![1]);
    }

    #[test]
    fn returns_false_when_accumulated_time_does_not_realize_another_frame() {
        let t = make(MakeOptions {
            frame_rate: Some(Some(10.0)),
            ..make_options()
        });
        play_timeline(&t);
        assert!(update_timeline(&t, 0.0));
        assert!(!update_timeline(&t, 50.0));
        assert!(update_timeline(&t, 50.0));
    }

    #[test]
    fn reports_the_realized_frame_before_a_frame_rate_null_source_advances() {
        let frames = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            frame_rate: Some(None),
            construct_frames: Some(frames.clone()),
            ..make_options()
        });
        play_timeline(&t);
        assert!(update_timeline(&t, 0.0));
        assert_eq!(t.read().unwrap().last_frame_update, 1);
        assert_eq!(t.read().unwrap().current_frame, 2);
        assert!(update_timeline(&t, 0.0));
        assert_eq!(t.read().unwrap().last_frame_update, 2);
        assert_eq!(t.read().unwrap().current_frame, 3);
        assert_eq!(*frames.lock().unwrap(), vec![1, 2]);
    }

    #[test]
    fn advances_one_frame_per_update_when_frame_rate_is_null() {
        let frames = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            frame_rate: Some(None),
            construct_frames: Some(frames.clone()),
            ..make_options()
        });
        play_timeline(&t);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        assert_eq!(*frames.lock().unwrap(), vec![1, 2, 3]);
    }

    #[test]
    fn advances_after_enough_time_has_elapsed_for_the_frame_rate() {
        let frames = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            frame_rate: Some(Some(10.0)),
            construct_frames: Some(frames.clone()),
            ..make_options()
        });
        play_timeline(&t);
        update_timeline(&t, 50.0);
        assert_eq!(*frames.lock().unwrap(), vec![1]);
        update_timeline(&t, 50.0);
        assert_eq!(*frames.lock().unwrap(), vec![1, 2]);
    }

    #[test]
    fn wraps_to_frame_1_after_the_last_frame_in_loop_mode() {
        let frames = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            total_frames: Some(3),
            frame_rate: Some(None),
            construct_frames: Some(frames.clone()),
            ..make_options()
        });
        play_timeline(&t);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        assert_eq!(*frames.lock().unwrap(), vec![1, 2, 3, 1]);
    }

    #[test]
    fn stops_at_the_last_frame_in_once_mode_and_does_not_wrap() {
        let frames = Arc::new(Mutex::new(Vec::new()));
        let t = make(MakeOptions {
            total_frames: Some(3),
            frame_rate: Some(None),
            construct_frames: Some(frames.clone()),
            ..make_options()
        });
        t.write().unwrap().play_mode = TimelinePlayMode::Once;
        play_timeline(&t);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        update_timeline(&t, 0.0);
        assert_eq!(*frames.lock().unwrap(), vec![1, 2, 3]);
        assert!(!t.read().unwrap().is_playing);
        assert_eq!(t.read().unwrap().current_frame, 3);
    }

    #[test]
    fn can_skip_multiple_frames_in_one_large_delta_time() {
        let t = make(MakeOptions {
            total_frames: Some(4),
            frame_rate: Some(Some(10.0)),
            ..make_options()
        });
        play_timeline(&t);
        update_timeline(&t, 250.0);
        assert_eq!(t.read().unwrap().current_frame, 3);
    }
}
