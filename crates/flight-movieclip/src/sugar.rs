//! D18 sugar for the MovieClip public-lane receiver: every method delegates to its free function.

use flight_entity::Ref;
use flight_timeline::{FrameScript, TimelineFrameArg, TimelineLabel, TimelineSourceRef};

use crate::movie_clip::*;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::Arc;

    use flight_timeline::contract::{TimelineSourceRef, create_timeline, create_timeline_source};

    use super::*;
    use crate::movie_clip::create_movie_clip;

    fn clip_with_source(total_frames: i32) -> Ref<MovieClip> {
        let clip = create_movie_clip();
        let source: TimelineSourceRef = create_timeline_source(None);
        source.write().unwrap().total_frames = total_frames;
        set_movie_clip_source(&clip, &source);
        return clip;
    }

    fn clip_with_timeline(current_frame: i32) -> Ref<MovieClip> {
        let clip = create_movie_clip();
        let timeline = create_timeline(None);
        timeline.write().unwrap().current_frame = current_frame;
        clip.write().unwrap().data.timeline = Some(timeline);
        return clip;
    }

    #[test]
    fn current_frame_matches_the_free_function() {
        let clip = clip_with_timeline(3);
        assert_eq!(clip.current_frame(), get_movie_clip_current_frame(&clip));
        assert_eq!(clip.current_frame(), 3);
    }

    #[test]
    fn total_frames_matches_the_free_function() {
        let clip = clip_with_source(7);
        assert_eq!(clip.total_frames(), get_movie_clip_total_frames(&clip));
        assert_eq!(clip.total_frames(), 7);
    }

    #[test]
    fn goto_and_stop_matches_the_free_function() {
        let method_clip = clip_with_source(5);
        let free_clip = clip_with_source(5);
        method_clip.goto_and_stop(&TimelineFrameArg::Frame(4));
        goto_and_stop_movie_clip(&free_clip, &TimelineFrameArg::Frame(4));
        assert_eq!(method_clip.current_frame(), free_clip.current_frame());
    }

    #[test]
    fn play_stop_and_is_playing_match_the_free_functions() {
        let method_clip = clip_with_source(3);
        let free_clip = clip_with_source(3);
        method_clip.play();
        play_movie_clip(&free_clip);
        assert_eq!(method_clip.is_playing(), free_clip.is_playing());
        method_clip.stop();
        stop_movie_clip(&free_clip);
        assert_eq!(method_clip.is_playing(), free_clip.is_playing());
    }

    #[test]
    fn next_and_prev_frame_match_the_free_functions() {
        let method_clip = clip_with_source(5);
        let free_clip = clip_with_source(5);
        method_clip.goto_and_stop(&TimelineFrameArg::Frame(3));
        goto_and_stop_movie_clip(&free_clip, &TimelineFrameArg::Frame(3));
        method_clip.next_frame();
        next_frame_movie_clip(&free_clip);
        assert_eq!(method_clip.current_frame(), free_clip.current_frame());
        method_clip.prev_frame();
        prev_frame_movie_clip(&free_clip);
        assert_eq!(method_clip.current_frame(), free_clip.current_frame());
    }

    #[test]
    fn frame_script_methods_match_the_free_functions() {
        let method_clip = clip_with_source(3);
        let free_clip = clip_with_source(3);
        let method_script: FrameScript =
            Arc::new(|_target: &flight_scene2d::Node2DRef, _frame: i32| {});
        let free_script: FrameScript =
            Arc::new(|_target: &flight_scene2d::Node2DRef, _frame: i32| {});
        method_clip.add_frame_script(&TimelineFrameArg::Frame(2), method_script.clone());
        add_movie_clip_frame_script(&free_clip, &TimelineFrameArg::Frame(2), free_script);
        assert!(
            method_clip
                .frame_script(&TimelineFrameArg::Frame(2))
                .is_some()
        );
        assert!(get_movie_clip_frame_script(&free_clip, &TimelineFrameArg::Frame(2)).is_some());
        method_clip.remove_frame_script(&TimelineFrameArg::Frame(2));
        remove_movie_clip_frame_script(&free_clip, &TimelineFrameArg::Frame(2));
        assert!(
            method_clip
                .frame_script(&TimelineFrameArg::Frame(2))
                .is_none()
        );
        assert!(get_movie_clip_frame_script(&free_clip, &TimelineFrameArg::Frame(2)).is_none());
    }

    #[test]
    fn signal_methods_match_the_free_functions() {
        let method_clip = clip_with_source(3);
        let free_clip = clip_with_source(3);
        let method_signals = method_clip.enable_signals();
        let free_signals = enable_movie_clip_signals(&free_clip);
        assert!(Arc::ptr_eq(
            &method_clip.signals().unwrap(),
            &method_signals
        ));
        assert!(Arc::ptr_eq(
            &get_movie_clip_signals(&free_clip).unwrap(),
            &free_signals
        ));
        method_clip.dispose_signals();
        dispose_movie_clip_signals(&free_clip);
        assert!(method_clip.signals().is_none());
        assert!(get_movie_clip_signals(&free_clip).is_none());
    }

    #[test]
    fn current_label_matches_the_free_function() {
        let clip = clip_with_source(3);
        assert_eq!(
            clip.current_label().map(|label| label.name),
            get_movie_clip_current_label(&clip).map(|label| label.name)
        );
    }

    #[test]
    fn goto_and_play_matches_the_free_function() {
        let method_clip = clip_with_source(5);
        let free_clip = clip_with_source(5);
        method_clip.goto_and_play(&TimelineFrameArg::Frame(2));
        goto_and_play_movie_clip(&free_clip, &TimelineFrameArg::Frame(2));
        assert_eq!(method_clip.current_frame(), free_clip.current_frame());
        assert_eq!(method_clip.is_playing(), free_clip.is_playing());
    }

    #[test]
    fn set_source_and_update_match_the_free_functions() {
        let method_clip = create_movie_clip();
        let free_clip = create_movie_clip();
        let method_source = create_timeline_source(None);
        method_source.write().unwrap().total_frames = 3;
        let free_source = create_timeline_source(None);
        free_source.write().unwrap().total_frames = 3;
        method_clip.set_source(&method_source);
        set_movie_clip_source(&free_clip, &free_source);
        assert_eq!(method_clip.total_frames(), free_clip.total_frames());
        method_clip.play();
        play_movie_clip(&free_clip);
        method_clip.update(0.0);
        update_movie_clip(&free_clip, 0.0);
        assert_eq!(method_clip.current_frame(), free_clip.current_frame());
    }
}

/// Convenience methods over a shared MovieClip handle; each delegates to the free-function contract.
pub trait MovieClipMethods {
    fn add_frame_script(&self, frame: &TimelineFrameArg, script: FrameScript);
    fn current_frame(&self) -> i32;
    fn current_label(&self) -> Option<TimelineLabel>;
    fn dispose_signals(&self);
    fn enable_signals(&self) -> MovieClipSignals;
    fn frame_script(&self, frame: &TimelineFrameArg) -> Option<FrameScript>;
    fn goto_and_play(&self, frame: &TimelineFrameArg);
    fn goto_and_stop(&self, frame: &TimelineFrameArg);
    fn is_playing(&self) -> bool;
    fn next_frame(&self);
    fn play(&self);
    fn prev_frame(&self);
    fn remove_frame_script(&self, frame: &TimelineFrameArg);
    fn set_source(&self, source: &TimelineSourceRef);
    fn signals(&self) -> Option<MovieClipSignals>;
    fn stop(&self);
    fn total_frames(&self) -> i32;
    fn update(&self, delta_time: f64);
}

impl MovieClipMethods for Ref<MovieClip> {
    fn add_frame_script(&self, frame: &TimelineFrameArg, script: FrameScript) {
        add_movie_clip_frame_script(self, frame, script);
    }

    fn current_frame(&self) -> i32 {
        return get_movie_clip_current_frame(self);
    }

    fn current_label(&self) -> Option<TimelineLabel> {
        return get_movie_clip_current_label(self);
    }

    fn dispose_signals(&self) {
        dispose_movie_clip_signals(self);
    }

    fn enable_signals(&self) -> MovieClipSignals {
        return enable_movie_clip_signals(self);
    }

    fn frame_script(&self, frame: &TimelineFrameArg) -> Option<FrameScript> {
        return get_movie_clip_frame_script(self, frame);
    }

    fn goto_and_play(&self, frame: &TimelineFrameArg) {
        goto_and_play_movie_clip(self, frame);
    }

    fn goto_and_stop(&self, frame: &TimelineFrameArg) {
        goto_and_stop_movie_clip(self, frame);
    }

    fn is_playing(&self) -> bool {
        return is_movie_clip_playing(self);
    }

    fn next_frame(&self) {
        next_frame_movie_clip(self);
    }

    fn play(&self) {
        play_movie_clip(self);
    }

    fn prev_frame(&self) {
        prev_frame_movie_clip(self);
    }

    fn remove_frame_script(&self, frame: &TimelineFrameArg) {
        remove_movie_clip_frame_script(self, frame);
    }

    fn set_source(&self, source: &TimelineSourceRef) {
        set_movie_clip_source(self, source);
    }

    fn signals(&self) -> Option<MovieClipSignals> {
        return get_movie_clip_signals(self);
    }

    fn stop(&self) {
        stop_movie_clip(self);
    }

    fn total_frames(&self) -> i32 {
        return get_movie_clip_total_frames(self);
    }

    // flight-lint: allow(f64) D1: deltaTime is milliseconds in the timeline's timing lane
    fn update(&self, delta_time: f64) {
        update_movie_clip(self, delta_time);
    }
}
