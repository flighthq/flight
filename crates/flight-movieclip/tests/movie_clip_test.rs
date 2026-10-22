use std::sync::{Arc, Mutex};

use flight_entity::Ref;
use flight_movieclip::contract::*;
use flight_scene2d::Node2DRef;
use flight_signals::connect_signal;
use flight_timeline::contract::*;

fn clip_with_timeline(timeline: TimelineRef) -> Ref<MovieClip> {
    let clip = create_movie_clip();
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
    let s = create_timeline_source(None);
    {
        let mut g = s.write().unwrap();
        g.total_frames = total_frames;
        g.frame_rate = frame_rate;
        g.construct_frame = construct;
    }
    return s;
}

fn five_frame_source() -> TimelineSourceRef {
    let s = create_timeline_source(None);
    s.write().unwrap().total_frames = 5;
    return s;
}

fn timeline_with(source: TimelineSourceRef, current_frame: Option<i32>) -> TimelineRef {
    let t = create_timeline(None);
    {
        let mut g = t.write().unwrap();
        g.source = Some(source);
        if let Some(cf) = current_frame {
            g.current_frame = cf;
        }
    }
    return t;
}

mod add_movie_clip_frame_script {
    use super::*;

    #[test]
    fn does_nothing_when_timeline_is_null() {
        let clip = create_movie_clip();
        add_movie_clip_frame_script(&clip, &TimelineFrameArg::Frame(1), Arc::new(|_t, _f| {}));
    }

    #[test]
    fn attaches_a_script_that_fires_on_frame_entry() {
        let fired = Arc::new(Mutex::new(Vec::new()));
        let fired_clone = fired.clone();
        let clip = create_movie_clip();
        let src = create_timeline_source(None);
        src.write().unwrap().total_frames = 3;
        let timeline = timeline_with(src, None);
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
        let clip = create_movie_clip();
        assert!(clip.read().unwrap().data.timeline.is_none());
        assert_eq!(
            flight_node::Node::node_fields(&*clip.read().unwrap()).kind,
            MOVIE_CLIP_KIND
        );
    }

    #[test]
    fn allows_predefined_values() {
        let timeline = create_timeline(None);
        let clip = create_movie_clip();
        clip.write().unwrap().data.timeline = Some(timeline.clone());
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
        assert!(!Arc::ptr_eq(&create_movie_clip(), &create_movie_clip()));
    }
}

mod create_movie_clip_data {
    use super::*;

    #[test]
    fn returns_default_values() {
        assert!(create_movie_clip_data().timeline.is_none());
    }

    #[test]
    fn allows_predefined_values() {
        let timeline = create_timeline(None);
        let mut data = create_movie_clip_data();
        data.timeline = Some(timeline.clone());
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
        let clip = create_movie_clip();
        set_movie_clip_source(&clip, &create_timeline_source(None));
        enable_movie_clip_signals(&clip);
        assert!(get_movie_clip_signals(&clip).is_some());
        dispose_movie_clip_signals(&clip);
        assert!(get_movie_clip_signals(&clip).is_none());
    }

    #[test]
    fn clears_the_underlying_timeline_signals() {
        let clip = create_movie_clip();
        set_movie_clip_source(&clip, &create_timeline_source(None));
        enable_movie_clip_signals(&clip);
        let timeline = clip.read().unwrap().data.timeline.clone().unwrap();
        assert!(timeline.read().unwrap().signals.is_some());
        dispose_movie_clip_signals(&clip);
        assert!(timeline.read().unwrap().signals.is_none());
    }

    #[test]
    fn is_idempotent() {
        let clip = create_movie_clip();
        dispose_movie_clip_signals(&clip);
        dispose_movie_clip_signals(&clip);
    }

    #[test]
    fn allows_signals_to_rearm_after_dispose() {
        let clip = create_movie_clip();
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
        let clip = create_movie_clip();
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
        let clip = create_movie_clip();
        set_movie_clip_source(&clip, &create_timeline_source(None));
        assert!(Arc::ptr_eq(
            &enable_movie_clip_signals(&clip),
            &enable_movie_clip_signals(&clip)
        ));
    }

    #[test]
    fn works_before_set_source() {
        let clip = create_movie_clip();
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
        let clip = create_movie_clip();
        let src = create_timeline_source(None);
        src.write().unwrap().total_frames = 3;
        set_movie_clip_source(&clip, &src);
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
        assert_eq!(get_movie_clip_current_frame(&create_movie_clip()), 1);
    }

    #[test]
    fn returns_the_timeline_current_frame() {
        let timeline = create_timeline(None);
        timeline.write().unwrap().current_frame = 3;
        let clip = clip_with_timeline(timeline);
        assert_eq!(get_movie_clip_current_frame(&clip), 3);
    }
}

mod get_movie_clip_current_label {
    use super::*;

    #[test]
    fn returns_none_when_timeline_is_null() {
        assert!(get_movie_clip_current_label(&create_movie_clip()).is_none());
    }

    #[test]
    fn returns_the_label_at_the_current_frame() {
        let clip = create_movie_clip();
        let src = create_timeline_source(None);
        {
            let mut g = src.write().unwrap();
            g.total_frames = 5;
            g.labels = Arc::new(vec![
                TimelineLabel {
                    frame: 1,
                    name: String::from("idle"),
                },
                TimelineLabel {
                    frame: 3,
                    name: String::from("run"),
                },
            ]);
        }
        set_movie_clip_source(&clip, &src);
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
            get_movie_clip_frame_script(&create_movie_clip(), &TimelineFrameArg::Frame(1))
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
        let clip = create_movie_clip();
        let guard = clip.read().unwrap();
        assert!(get_movie_clip_runtime(&guard).movie_clip_signals.is_none());
    }
}

mod get_movie_clip_signals {
    use super::*;

    #[test]
    fn returns_none_before_enabling() {
        assert!(get_movie_clip_signals(&create_movie_clip()).is_none());
    }

    #[test]
    fn returns_the_group_after_enabling() {
        let clip = create_movie_clip();
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
        assert_eq!(get_movie_clip_total_frames(&create_movie_clip()), 1);
    }

    #[test]
    fn returns_the_source_total_frames() {
        let src = create_timeline_source(None);
        src.write().unwrap().total_frames = 10;
        let clip = clip_with_timeline(timeline_with(src, None));
        assert_eq!(get_movie_clip_total_frames(&clip), 10);
    }
}

mod goto_and_play_movie_clip {
    use super::*;

    #[test]
    fn does_nothing_when_timeline_is_null() {
        goto_and_play_movie_clip(&create_movie_clip(), &TimelineFrameArg::Frame(2));
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
        goto_and_stop_movie_clip(&create_movie_clip(), &TimelineFrameArg::Frame(2));
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

mod initialize_movie_clip {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_movie_clip() {
        let clip = create_movie_clip();
        initialize_movie_clip(&mut *clip.write().unwrap());
        assert!(clip.read().unwrap().data.timeline.is_none());
    }
}

mod initialize_movie_clip_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_movie_clip_data() {
        let mut data = create_movie_clip_data();
        initialize_movie_clip_data(&mut data);
        assert!(data.timeline.is_none());
    }
}

mod is_movie_clip_playing {
    use super::*;

    #[test]
    fn returns_false_when_timeline_is_null() {
        assert!(!is_movie_clip_playing(&create_movie_clip()));
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
        next_frame_movie_clip(&create_movie_clip());
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
        play_movie_clip(&create_movie_clip());
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
        prev_frame_movie_clip(&create_movie_clip());
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
        remove_movie_clip_frame_script(&create_movie_clip(), &TimelineFrameArg::Frame(1));
    }

    #[test]
    fn removes_the_script_so_it_no_longer_fires() {
        let fired = Arc::new(Mutex::new(Vec::new()));
        let fired_clone = fired.clone();
        let clip = create_movie_clip();
        let src = create_timeline_source(None);
        src.write().unwrap().total_frames = 3;
        let timeline = timeline_with(src, None);
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
        let clip = create_movie_clip();
        set_movie_clip_source(&clip, &source(4, None, frames.clone()));
        assert_eq!(get_movie_clip_total_frames(&clip), 4);
        let timeline = clip.read().unwrap().data.timeline.clone().unwrap();
        let target = timeline.read().unwrap().target.clone().unwrap();
        assert!(Arc::ptr_eq(&target, &(clip.clone() as Node2DRef)));
        assert_eq!(*frames.lock().unwrap(), vec![1]);
    }

    #[test]
    fn reuses_an_existing_timeline() {
        let clip = create_movie_clip();
        let existing = create_timeline(None);
        existing.write().unwrap().current_frame = 2;
        clip.write().unwrap().data.timeline = Some(existing.clone());
        let src = create_timeline_source(None);
        src.write().unwrap().total_frames = 5;
        set_movie_clip_source(&clip, &src);
        let stored = clip.read().unwrap().data.timeline.clone().unwrap();
        assert!(Arc::ptr_eq(&stored, &existing));
        assert_eq!(get_movie_clip_total_frames(&clip), 5);
    }
}

mod stop_movie_clip {
    use super::*;

    #[test]
    fn does_nothing_when_timeline_is_null() {
        stop_movie_clip(&create_movie_clip());
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
        update_movie_clip(&create_movie_clip(), 16.0);
    }

    #[test]
    fn advances_the_timeline_when_playing() {
        let frames = Arc::new(Mutex::new(Vec::new()));
        let clip = create_movie_clip();
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
        let clip = create_movie_clip();
        let timeline = timeline_with(source(3, None, frames.clone()), None);
        clip.write().unwrap().data.timeline = Some(timeline.clone());
        timeline.write().unwrap().target = Some(clip.clone() as Node2DRef);
        update_movie_clip(&clip, 0.0);
        assert_eq!(*frames.lock().unwrap(), vec![1]);
    }
}
