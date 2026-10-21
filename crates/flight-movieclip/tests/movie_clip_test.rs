use std::sync::{Arc, Mutex};

use flight_entity::Ref;
use flight_movieclip::contract::*;
use flight_scene2d::Node2DRef;
use flight_signals::connect_signal;
use flight_timeline::contract::*;

fn clip_with_timeline(timeline: TimelineRef) -> Ref<MovieClip> {
    let clip = create_movie_clip(None);
    clip.write().unwrap().data.timeline = Some(timeline.clone());
    timeline.write().unwrap().target = Some(clip.clone() as Node2DRef);
    return clip;
}

fn source(
    total_frames: i32,
    frame_rate: Option<f64>,
    frames: Arc<Mutex<Vec<i32>>>,
) -> TimelineSourceRef {
    let construct: FrameConstruct = Arc::new(move |_target: &Node2DRef, frame: i32| {
        frames.lock().unwrap().push(frame);
    });
    return create_timeline_source(Some(&TimelineSourceOptions {
        total_frames: Some(total_frames),
        frame_rate,
        labels: None,
        cues: None,
        construct_frame: Some(construct),
    }));
}

fn five_frame_source() -> TimelineSourceRef {
    return create_timeline_source(Some(&TimelineSourceOptions {
        total_frames: Some(5),
        frame_rate: None,
        labels: None,
        cues: None,
        construct_frame: None,
    }));
}

fn timeline_with(source: TimelineSourceRef, current_frame: Option<i32>) -> TimelineRef {
    return create_timeline(Some(&TimelineOptions {
        source: Some(source),
        target: None,
        cue_registry: None,
        current_frame,
        frame_scripts: None,
        is_playing: None,
        play_mode: None,
        signals: None,
    }));
}

mod add_movie_clip_frame_script {
    use super::*;

    #[test]
    fn does_nothing_when_timeline_is_null() {
        let clip = create_movie_clip(None);
        add_movie_clip_frame_script(&clip, &TimelineFrameArg::Frame(1), Arc::new(|_t, _f| {}));
    }

    #[test]
    fn attaches_a_script_that_fires_on_frame_entry() {
        let fired = Arc::new(Mutex::new(Vec::new()));
        let fired_clone = fired.clone();
        let clip = create_movie_clip(None);
        let timeline = timeline_with(
            create_timeline_source(Some(&TimelineSourceOptions {
                total_frames: Some(3),
                frame_rate: None,
                labels: None,
                cues: None,
                construct_frame: None,
            })),
            None,
        );
        clip.write().unwrap().data.timeline = Some(timeline.clone());
        timeline.write().unwrap().target = Some(clip.clone() as Node2DRef);
        add_movie_clip_frame_script(
            &clip,
            &TimelineFrameArg::Frame(2),
            Arc::new(move |_target: &Node2DRef, frame: i32| {
                fired_clone.lock().unwrap().push(frame)
            }),
        );
        play_movie_clip(&clip);
        update_movie_clip(&clip, 0.0);
        update_movie_clip(&clip, 0.0);
        assert_eq!(*fired.lock().unwrap(), vec![2]);
    }
}

mod create_movie_clip {
    use super::*;

    #[test]
    fn initializes_default_values() {
        let clip = create_movie_clip(None);
        assert!(clip.read().unwrap().data.timeline.is_none());
        assert_eq!(
            flight_node::Node::node_fields(&*clip.read().unwrap()).kind,
            MOVIE_CLIP_KIND
        );
    }

    #[test]
    fn allows_predefined_values() {
        let timeline = create_timeline(None);
        let clip = create_movie_clip(Some(&PartialMovieClip {
            data: Some(MovieClipDataOptions {
                timeline: Some(timeline.clone()),
            }),
            node: flight_scene2d::PartialNode2D {
                alpha: None,
                blend_mode: None,
                clip: None,
                enabled: None,
                material: None,
                material_data: None,
                name: None,
                pivot_x: None,
                pivot_y: None,
                rotation: None,
                scale_x: None,
                scale_y: None,
                skew_x: None,
                skew_y: None,
                visible: None,
                x: None,
                y: None,
            },
        }));
        let stored = clip
            .read()
            .unwrap()
            .data
            .timeline
            .clone()
            .expect("timeline");
        assert!(Arc::ptr_eq(&stored, &timeline));
    }

    #[test]
    fn returns_a_new_object() {
        assert!(!Arc::ptr_eq(
            &create_movie_clip(None),
            &create_movie_clip(None)
        ));
    }
}

mod create_movie_clip_data {
    use super::*;

    #[test]
    fn returns_default_values() {
        assert!(create_movie_clip_data(None).timeline.is_none());
    }

    #[test]
    fn allows_predefined_values() {
        let timeline = create_timeline(None);
        let data = create_movie_clip_data(Some(&MovieClipDataOptions {
            timeline: Some(timeline.clone()),
        }));
        assert!(Arc::ptr_eq(data.timeline.as_ref().unwrap(), &timeline));
    }
}

mod create_movie_clip_runtime {
    use super::*;

    #[test]
    fn returns_a_non_null_runtime_with_signals_null() {
        let runtime = create_movie_clip_runtime();
        assert!(runtime.movie_clip_signals.is_none());
    }
}

mod dispose_movie_clip_signals {
    use super::*;

    #[test]
    fn clears_signals_to_null() {
        let clip = create_movie_clip(None);
        set_movie_clip_source(&clip, &create_timeline_source(None));
        enable_movie_clip_signals(&clip);
        assert!(get_movie_clip_signals(&clip).is_some());
        dispose_movie_clip_signals(&clip);
        assert!(get_movie_clip_signals(&clip).is_none());
    }

    #[test]
    fn clears_the_underlying_timeline_signals() {
        let clip = create_movie_clip(None);
        set_movie_clip_source(&clip, &create_timeline_source(None));
        enable_movie_clip_signals(&clip);
        let timeline = clip.read().unwrap().data.timeline.clone().unwrap();
        assert!(timeline.read().unwrap().signals.is_some());
        dispose_movie_clip_signals(&clip);
        assert!(timeline.read().unwrap().signals.is_none());
    }

    #[test]
    fn is_idempotent() {
        let clip = create_movie_clip(None);
        dispose_movie_clip_signals(&clip);
        dispose_movie_clip_signals(&clip);
    }

    #[test]
    fn allows_signals_to_rearm_after_dispose() {
        let clip = create_movie_clip(None);
        set_movie_clip_source(&clip, &create_timeline_source(None));
        let first = enable_movie_clip_signals(&clip);
        dispose_movie_clip_signals(&clip);
        let second = enable_movie_clip_signals(&clip);
        assert!(!Arc::ptr_eq(&first, &second));
        assert!(Arc::ptr_eq(
            &get_movie_clip_signals(&clip).unwrap(),
            &second
        ));
    }
}

mod enable_movie_clip_signals {
    use super::*;

    #[test]
    fn returns_a_signals_group_with_all_lifecycle_signals() {
        let clip = create_movie_clip(None);
        set_movie_clip_source(&clip, &create_timeline_source(None));
        let signals = enable_movie_clip_signals(&clip);
        let signals = signals.read().unwrap();
        assert!(Arc::strong_count(&signals.on_enter_frame.emit) >= 1);
        assert!(Arc::strong_count(&signals.on_exit_frame.emit) >= 1);
        assert!(Arc::strong_count(&signals.on_frame_constructed.emit) >= 1);
        assert!(Arc::strong_count(&signals.on_complete.emit) >= 1);
        assert!(Arc::strong_count(&signals.on_loop.emit) >= 1);
    }

    #[test]
    fn is_idempotent() {
        let clip = create_movie_clip(None);
        set_movie_clip_source(&clip, &create_timeline_source(None));
        assert!(Arc::ptr_eq(
            &enable_movie_clip_signals(&clip),
            &enable_movie_clip_signals(&clip)
        ));
    }

    #[test]
    fn works_before_set_source() {
        let clip = create_movie_clip(None);
        let signals = enable_movie_clip_signals(&clip);
        assert!(clip.read().unwrap().data.timeline.is_some());
        assert!(Arc::ptr_eq(
            &get_movie_clip_signals(&clip).unwrap(),
            &signals
        ));
    }

    #[test]
    fn emits_enter_frame_when_the_frame_changes() {
        let frames = Arc::new(Mutex::new(Vec::new()));
        let seen = frames.clone();
        let clip = create_movie_clip(None);
        set_movie_clip_source(
            &clip,
            &create_timeline_source(Some(&TimelineSourceOptions {
                total_frames: Some(3),
                frame_rate: None,
                labels: None,
                cues: None,
                construct_frame: None,
            })),
        );
        let signals = enable_movie_clip_signals(&clip);
        let signal = signals.read().unwrap().on_enter_frame.clone();
        connect_signal(
            &signal,
            Arc::new(move |event: &TimelineFrameEvent| seen.lock().unwrap().push(event.frame)),
            None,
        );
        play_movie_clip(&clip);
        update_movie_clip(&clip, 0.0);
        update_movie_clip(&clip, 0.0);
        assert!(frames.lock().unwrap().contains(&2));
    }
}

mod get_movie_clip_current_frame {
    use super::*;

    #[test]
    fn returns_one_when_timeline_is_null() {
        assert_eq!(get_movie_clip_current_frame(&create_movie_clip(None)), 1);
    }

    #[test]
    fn returns_the_timeline_current_frame() {
        let clip = clip_with_timeline(create_timeline(Some(&TimelineOptions {
            source: None,
            target: None,
            cue_registry: None,
            current_frame: Some(3),
            frame_scripts: None,
            is_playing: None,
            play_mode: None,
            signals: None,
        })));
        assert_eq!(get_movie_clip_current_frame(&clip), 3);
    }
}

mod get_movie_clip_current_label {
    use super::*;

    #[test]
    fn returns_none_when_timeline_is_null() {
        assert!(get_movie_clip_current_label(&create_movie_clip(None)).is_none());
    }

    #[test]
    fn returns_the_label_at_the_current_frame() {
        let clip = create_movie_clip(None);
        set_movie_clip_source(
            &clip,
            &create_timeline_source(Some(&TimelineSourceOptions {
                total_frames: Some(5),
                frame_rate: None,
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
                cues: None,
                construct_frame: None,
            })),
        );
        goto_and_stop_movie_clip(&clip, &TimelineFrameArg::Frame(3));
        assert_eq!(
            get_movie_clip_current_label(&clip).map(|label| label.name),
            Some(String::from("run"))
        );
    }
}

mod get_movie_clip_frame_script {
    use super::*;

    #[test]
    fn returns_none_when_timeline_is_null() {
        assert!(
            get_movie_clip_frame_script(&create_movie_clip(None), &TimelineFrameArg::Frame(1))
                .is_none()
        );
    }

    #[test]
    fn returns_none_when_no_script_is_attached() {
        let clip = clip_with_timeline(timeline_with(five_frame_source(), None));
        assert!(get_movie_clip_frame_script(&clip, &TimelineFrameArg::Frame(1)).is_none());
    }

    #[test]
    fn returns_the_script_after_attaching_it() {
        let clip = clip_with_timeline(timeline_with(five_frame_source(), None));
        let script: FrameScript = Arc::new(|_t: &Node2DRef, _f: i32| {});
        add_movie_clip_frame_script(&clip, &TimelineFrameArg::Frame(2), script.clone());
        let stored = get_movie_clip_frame_script(&clip, &TimelineFrameArg::Frame(2)).unwrap();
        assert!(Arc::ptr_eq(&stored, &script));
    }
}

mod get_movie_clip_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_for_a_movie_clip() {
        let clip = create_movie_clip(None);
        let guard = clip.read().unwrap();
        assert!(get_movie_clip_runtime(&guard).movie_clip_signals.is_none());
    }
}

mod get_movie_clip_signals {
    use super::*;

    #[test]
    fn returns_none_before_enabling() {
        assert!(get_movie_clip_signals(&create_movie_clip(None)).is_none());
    }

    #[test]
    fn returns_the_group_after_enabling() {
        let clip = create_movie_clip(None);
        set_movie_clip_source(&clip, &create_timeline_source(None));
        let signals = enable_movie_clip_signals(&clip);
        assert!(Arc::ptr_eq(
            &get_movie_clip_signals(&clip).unwrap(),
            &signals
        ));
    }
}

mod get_movie_clip_total_frames {
    use super::*;

    #[test]
    fn returns_one_when_timeline_is_null() {
        assert_eq!(get_movie_clip_total_frames(&create_movie_clip(None)), 1);
    }

    #[test]
    fn returns_the_source_total_frames() {
        let clip = clip_with_timeline(timeline_with(
            create_timeline_source(Some(&TimelineSourceOptions {
                total_frames: Some(10),
                frame_rate: None,
                labels: None,
                cues: None,
                construct_frame: None,
            })),
            None,
        ));
        assert_eq!(get_movie_clip_total_frames(&clip), 10);
    }
}

mod goto_and_play_movie_clip {
    use super::*;

    #[test]
    fn does_nothing_when_timeline_is_null() {
        goto_and_play_movie_clip(&create_movie_clip(None), &TimelineFrameArg::Frame(2));
    }

    #[test]
    fn seeks_and_starts_playing() {
        let clip = clip_with_timeline(timeline_with(five_frame_source(), None));
        goto_and_play_movie_clip(&clip, &TimelineFrameArg::Frame(3));
        assert_eq!(get_movie_clip_current_frame(&clip), 3);
        assert!(is_movie_clip_playing(&clip));
    }
}

mod goto_and_stop_movie_clip {
    use super::*;

    #[test]
    fn does_nothing_when_timeline_is_null() {
        goto_and_stop_movie_clip(&create_movie_clip(None), &TimelineFrameArg::Frame(2));
    }

    #[test]
    fn seeks_and_stops() {
        let clip = clip_with_timeline(timeline_with(five_frame_source(), None));
        play_movie_clip(&clip);
        goto_and_stop_movie_clip(&clip, &TimelineFrameArg::Frame(2));
        assert_eq!(get_movie_clip_current_frame(&clip), 2);
        assert!(!is_movie_clip_playing(&clip));
    }
}

mod initialize_movie_clip_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_movie_clip_data() {
        let mut data = create_movie_clip_data(None);
        let timeline = create_timeline(None);
        initialize_movie_clip_data(
            &mut data,
            Some(&MovieClipDataOptions {
                timeline: Some(timeline.clone()),
            }),
        );
        assert!(Arc::ptr_eq(data.timeline.as_ref().unwrap(), &timeline));
    }
}

mod is_movie_clip_playing {
    use super::*;

    #[test]
    fn returns_false_when_timeline_is_null() {
        assert!(!is_movie_clip_playing(&create_movie_clip(None)));
    }

    #[test]
    fn returns_true_when_playing() {
        let clip = clip_with_timeline(timeline_with(five_frame_source(), None));
        play_movie_clip(&clip);
        assert!(is_movie_clip_playing(&clip));
    }
}

mod next_frame_movie_clip {
    use super::*;

    #[test]
    fn does_nothing_when_timeline_is_null() {
        next_frame_movie_clip(&create_movie_clip(None));
    }

    #[test]
    fn advances_the_frame_by_one() {
        let clip = clip_with_timeline(timeline_with(five_frame_source(), Some(2)));
        next_frame_movie_clip(&clip);
        assert_eq!(get_movie_clip_current_frame(&clip), 3);
    }
}

mod play_movie_clip {
    use super::*;

    #[test]
    fn does_nothing_when_timeline_is_null() {
        play_movie_clip(&create_movie_clip(None));
    }

    #[test]
    fn starts_the_timeline_playing() {
        let clip = clip_with_timeline(timeline_with(five_frame_source(), None));
        play_movie_clip(&clip);
        assert!(is_movie_clip_playing(&clip));
    }
}

mod prev_frame_movie_clip {
    use super::*;

    #[test]
    fn does_nothing_when_timeline_is_null() {
        prev_frame_movie_clip(&create_movie_clip(None));
    }

    #[test]
    fn moves_the_frame_back_by_one() {
        let clip = clip_with_timeline(timeline_with(five_frame_source(), Some(3)));
        prev_frame_movie_clip(&clip);
        assert_eq!(get_movie_clip_current_frame(&clip), 2);
    }
}

mod remove_movie_clip_frame_script {
    use super::*;

    #[test]
    fn does_nothing_when_timeline_is_null() {
        remove_movie_clip_frame_script(&create_movie_clip(None), &TimelineFrameArg::Frame(1));
    }

    #[test]
    fn removes_the_script_so_it_no_longer_fires() {
        let fired = Arc::new(Mutex::new(Vec::new()));
        let fired_clone = fired.clone();
        let clip = create_movie_clip(None);
        let timeline = timeline_with(
            create_timeline_source(Some(&TimelineSourceOptions {
                total_frames: Some(3),
                frame_rate: None,
                labels: None,
                cues: None,
                construct_frame: None,
            })),
            None,
        );
        clip.write().unwrap().data.timeline = Some(timeline.clone());
        timeline.write().unwrap().target = Some(clip.clone() as Node2DRef);
        add_movie_clip_frame_script(
            &clip,
            &TimelineFrameArg::Frame(2),
            Arc::new(move |_t: &Node2DRef, frame: i32| fired_clone.lock().unwrap().push(frame)),
        );
        remove_movie_clip_frame_script(&clip, &TimelineFrameArg::Frame(2));
        play_movie_clip(&clip);
        update_movie_clip(&clip, 0.0);
        update_movie_clip(&clip, 0.0);
        assert!(fired.lock().unwrap().is_empty());
    }
}

mod set_movie_clip_source {
    use super::*;

    #[test]
    fn binds_a_source_targets_the_clip_and_realizes_the_initial_frame() {
        let frames = Arc::new(Mutex::new(Vec::new()));
        let clip = create_movie_clip(None);
        set_movie_clip_source(&clip, &source(4, None, frames.clone()));
        assert_eq!(get_movie_clip_total_frames(&clip), 4);
        let timeline = clip.read().unwrap().data.timeline.clone().unwrap();
        let target = timeline.read().unwrap().target.clone().unwrap();
        assert!(Arc::ptr_eq(&target, &(clip.clone() as Node2DRef)));
        assert_eq!(*frames.lock().unwrap(), vec![1]);
    }

    #[test]
    fn reuses_an_existing_timeline() {
        let clip = create_movie_clip(None);
        let existing = create_timeline(Some(&TimelineOptions {
            source: None,
            target: None,
            cue_registry: None,
            current_frame: Some(2),
            frame_scripts: None,
            is_playing: None,
            play_mode: None,
            signals: None,
        }));
        clip.write().unwrap().data.timeline = Some(existing.clone());
        set_movie_clip_source(
            &clip,
            &create_timeline_source(Some(&TimelineSourceOptions {
                total_frames: Some(5),
                frame_rate: None,
                labels: None,
                cues: None,
                construct_frame: None,
            })),
        );
        let stored = clip.read().unwrap().data.timeline.clone().unwrap();
        assert!(Arc::ptr_eq(&stored, &existing));
        assert_eq!(get_movie_clip_total_frames(&clip), 5);
    }
}

mod stop_movie_clip {
    use super::*;

    #[test]
    fn does_nothing_when_timeline_is_null() {
        stop_movie_clip(&create_movie_clip(None));
    }

    #[test]
    fn stops_a_playing_timeline() {
        let clip = clip_with_timeline(timeline_with(five_frame_source(), None));
        play_movie_clip(&clip);
        stop_movie_clip(&clip);
        assert!(!is_movie_clip_playing(&clip));
    }
}

mod update_movie_clip {
    use super::*;

    #[test]
    fn does_nothing_when_timeline_is_null() {
        update_movie_clip(&create_movie_clip(None), 16.0);
    }

    #[test]
    fn advances_the_timeline_when_playing() {
        let frames = Arc::new(Mutex::new(Vec::new()));
        let clip = create_movie_clip(None);
        let timeline = timeline_with(source(3, None, frames.clone()), None);
        clip.write().unwrap().data.timeline = Some(timeline.clone());
        timeline.write().unwrap().target = Some(clip.clone() as Node2DRef);
        play_movie_clip(&clip);
        update_movie_clip(&clip, 16.0);
        update_movie_clip(&clip, 16.0);
        assert_eq!(*frames.lock().unwrap(), vec![1, 2]);
    }

    #[test]
    fn fires_construct_frame_for_frame_one_on_first_update_even_stopped() {
        let frames = Arc::new(Mutex::new(Vec::new()));
        let clip = create_movie_clip(None);
        let timeline = timeline_with(source(3, None, frames.clone()), None);
        clip.write().unwrap().data.timeline = Some(timeline.clone());
        timeline.write().unwrap().target = Some(clip.clone() as Node2DRef);
        update_movie_clip(&clip, 0.0);
        assert_eq!(*frames.lock().unwrap(), vec![1]);
    }
}
