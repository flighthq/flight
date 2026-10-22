//! D18 sugar for the public timeline receiver (thin methods delegating to the free functions).

use crate::timeline::*;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    fn timeline() -> TimelineRef {
        return create_timeline(None);
    }

    fn frame_script() -> FrameScript {
        return std::sync::Arc::new(
            |_target: &flight_scene2d::contract::Node2DRef, _frame: i32| {},
        );
    }

    #[test]
    fn add_frame_script_method_matches_add_timeline_frame_script() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        method_timeline.add_frame_script(&TimelineFrameArg::Frame(2), frame_script());
        add_timeline_frame_script(&free_timeline, &TimelineFrameArg::Frame(2), frame_script());
        let mut method_frames = Vec::new();
        let mut free_frames = Vec::new();
        get_timeline_frame_script_frames(&mut method_frames, &method_timeline);
        get_timeline_frame_script_frames(&mut free_frames, &free_timeline);
        assert_eq!(method_frames, free_frames);
    }

    #[test]
    fn clear_frame_scripts_method_matches_clear_timeline_frame_scripts() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        method_timeline.clear_frame_scripts();
        clear_timeline_frame_scripts(&free_timeline);
        assert_eq!(
            method_timeline.read().unwrap().frame_scripts.is_none(),
            free_timeline.read().unwrap().frame_scripts.is_none()
        );
    }

    #[test]
    fn dispose_signals_method_matches_dispose_timeline_signals() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        method_timeline.dispose_signals();
        dispose_timeline_signals(&free_timeline);
        assert_eq!(
            method_timeline.read().unwrap().signals.is_none(),
            free_timeline.read().unwrap().signals.is_none()
        );
    }

    #[test]
    fn enable_signals_method_matches_enable_timeline_signals() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        let method_signals = method_timeline.enable_signals();
        let free_signals = enable_timeline_signals(&free_timeline);
        assert_eq!(
            std::sync::Arc::ptr_eq(
                &method_timeline.read().unwrap().signals.clone().unwrap(),
                &method_signals
            ),
            std::sync::Arc::ptr_eq(
                &free_timeline.read().unwrap().signals.clone().unwrap(),
                &free_signals
            )
        );
    }

    #[test]
    fn find_label_method_matches_find_timeline_label() {
        let source = create_timeline_source(None);
        source.write().unwrap().labels =
            std::sync::Arc::new(vec![TimelineLabel { frame: 3, name: String::from("run") }]);
        let method_timeline = create_timeline(None);
        method_timeline.write().unwrap().source = Some(source);
        let free_timeline = method_timeline.clone();
        assert_eq!(
            method_timeline.find_label("run"),
            find_timeline_label(&free_timeline, "run")
        );
    }

    #[test]
    fn get_current_label_method_matches_get_timeline_current_label() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        assert_eq!(
            method_timeline.get_current_label(),
            get_timeline_current_label(&free_timeline)
        );
    }

    #[test]
    fn get_frame_script_method_matches_get_timeline_frame_script() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        method_timeline.add_frame_script(&TimelineFrameArg::Frame(2), frame_script());
        add_timeline_frame_script(&free_timeline, &TimelineFrameArg::Frame(2), frame_script());
        assert_eq!(
            method_timeline
                .get_frame_script(&TimelineFrameArg::Frame(2))
                .is_some(),
            get_timeline_frame_script(&free_timeline, &TimelineFrameArg::Frame(2)).is_some()
        );
    }

    #[test]
    fn get_frame_script_frames_method_matches_get_timeline_frame_script_frames() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        let mut free_frames = Vec::new();
        get_timeline_frame_script_frames(&mut free_frames, &free_timeline);
        assert_eq!(method_timeline.get_frame_script_frames(), free_frames);
    }

    #[test]
    fn get_labels_method_matches_get_timeline_labels() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        assert_eq!(
            method_timeline.get_labels().as_ref(),
            get_timeline_labels(&free_timeline).as_ref()
        );
    }

    #[test]
    fn goto_and_play_method_matches_goto_and_play_timeline() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        method_timeline.goto_and_play(&TimelineFrameArg::Frame(2));
        goto_and_play_timeline(&free_timeline, &TimelineFrameArg::Frame(2));
        assert_eq!(
            method_timeline.read().unwrap().current_frame,
            free_timeline.read().unwrap().current_frame
        );
    }

    #[test]
    fn goto_and_stop_method_matches_goto_and_stop_timeline() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        method_timeline.goto_and_stop(&TimelineFrameArg::Frame(2));
        goto_and_stop_timeline(&free_timeline, &TimelineFrameArg::Frame(2));
        assert_eq!(
            method_timeline.read().unwrap().current_frame,
            free_timeline.read().unwrap().current_frame
        );
    }

    #[test]
    fn next_frame_method_matches_next_frame_timeline() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        method_timeline.next_frame();
        next_frame_timeline(&free_timeline);
        assert_eq!(
            method_timeline.read().unwrap().current_frame,
            free_timeline.read().unwrap().current_frame
        );
    }

    #[test]
    fn play_method_matches_play_timeline() {
        let source = create_timeline_source(None);
        source.write().unwrap().total_frames = 4;
        let method_timeline = create_timeline(None);
        method_timeline.write().unwrap().source = Some(source);
        let free_timeline = method_timeline.clone();
        method_timeline.play();
        play_timeline(&free_timeline);
        assert_eq!(
            method_timeline.read().unwrap().is_playing,
            free_timeline.read().unwrap().is_playing
        );
    }

    #[test]
    fn prev_frame_method_matches_prev_frame_timeline() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        method_timeline.prev_frame();
        prev_frame_timeline(&free_timeline);
        assert_eq!(
            method_timeline.read().unwrap().current_frame,
            free_timeline.read().unwrap().current_frame
        );
    }

    #[test]
    fn remove_frame_script_method_matches_remove_timeline_frame_script() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        method_timeline.remove_frame_script(&TimelineFrameArg::Frame(2));
        remove_timeline_frame_script(&free_timeline, &TimelineFrameArg::Frame(2));
        assert_eq!(
            method_timeline.read().unwrap().frame_scripts.is_none(),
            free_timeline.read().unwrap().frame_scripts.is_none()
        );
    }

    #[test]
    fn stop_method_matches_stop_timeline() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        method_timeline.stop();
        stop_timeline(&free_timeline);
        assert_eq!(
            method_timeline.read().unwrap().is_playing,
            free_timeline.read().unwrap().is_playing
        );
    }

    #[test]
    fn update_method_matches_update_timeline() {
        let method_timeline = timeline();
        let free_timeline = timeline();
        assert_eq!(
            method_timeline.update(0.0),
            update_timeline(&free_timeline, 0.0)
        );
    }
}

/// Sugar for a shared timeline handle.
pub trait TimelineMethods {
    fn add_frame_script(&self, frame: &TimelineFrameArg, script: FrameScript);
    fn clear_frame_scripts(&self);
    fn dispose_signals(&self);
    fn enable_signals(&self) -> std::sync::Arc<std::sync::RwLock<TimelineSignals>>;
    fn find_label(&self, name: &str) -> Option<TimelineLabel>;
    fn get_current_label(&self) -> Option<TimelineLabel>;
    fn get_frame_script(&self, frame: &TimelineFrameArg) -> Option<FrameScript>;
    fn get_frame_script_frames(&self) -> Vec<i32>;
    fn get_labels(&self) -> std::sync::Arc<Vec<TimelineLabel>>;
    fn goto_and_play(&self, frame: &TimelineFrameArg);
    fn goto_and_stop(&self, frame: &TimelineFrameArg);
    fn next_frame(&self);
    fn play(&self);
    fn prev_frame(&self);
    fn remove_frame_script(&self, frame: &TimelineFrameArg);
    fn stop(&self);
    // flight-lint: allow(f64) D1: deltaTime is accumulated milliseconds
    fn update(&self, delta_time: f64) -> bool;
}

impl TimelineMethods for TimelineRef {
    fn add_frame_script(&self, frame: &TimelineFrameArg, script: FrameScript) {
        add_timeline_frame_script(self, frame, script);
    }

    fn clear_frame_scripts(&self) {
        clear_timeline_frame_scripts(self);
    }

    fn dispose_signals(&self) {
        dispose_timeline_signals(self);
    }

    fn enable_signals(&self) -> std::sync::Arc<std::sync::RwLock<TimelineSignals>> {
        return enable_timeline_signals(self);
    }

    fn find_label(&self, name: &str) -> Option<TimelineLabel> {
        return find_timeline_label(self, name);
    }

    fn get_current_label(&self) -> Option<TimelineLabel> {
        return get_timeline_current_label(self);
    }

    fn get_frame_script(&self, frame: &TimelineFrameArg) -> Option<FrameScript> {
        return get_timeline_frame_script(self, frame);
    }

    fn get_frame_script_frames(&self) -> Vec<i32> {
        let mut out = Vec::new();
        get_timeline_frame_script_frames(&mut out, self);
        return out;
    }

    fn get_labels(&self) -> std::sync::Arc<Vec<TimelineLabel>> {
        return get_timeline_labels(self);
    }

    fn goto_and_play(&self, frame: &TimelineFrameArg) {
        goto_and_play_timeline(self, frame);
    }

    fn goto_and_stop(&self, frame: &TimelineFrameArg) {
        goto_and_stop_timeline(self, frame);
    }

    fn next_frame(&self) {
        next_frame_timeline(self);
    }

    fn play(&self) {
        play_timeline(self);
    }

    fn prev_frame(&self) {
        prev_frame_timeline(self);
    }

    fn remove_frame_script(&self, frame: &TimelineFrameArg) {
        remove_timeline_frame_script(self, frame);
    }

    fn stop(&self) {
        stop_timeline(self);
    }

    // flight-lint: allow(f64) D1: deltaTime is accumulated milliseconds
    fn update(&self, delta_time: f64) -> bool {
        return update_timeline(self, delta_time);
    }
}
