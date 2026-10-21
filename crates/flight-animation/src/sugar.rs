//! Rust convenience methods for the public animation lane (D18).

use crate::contract::*;
use flight_entity::Ref;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use std::sync::{Arc, RwLock};

    fn simple_track() -> AnimationTrack {
        return create_animation_track(CreateAnimationTrackOpts {
            times: vec![0.0, 1.0],
            values: vec![0.0, 10.0],
            components: None,
            interpolation: None,
            quaternion: None,
            easing: None,
            segment_easings: None,
        });
    }

    fn simple_clip() -> AnimationClip {
        return create_animation_clip(
            vec![create_animation_channel(simple_track(), 1)],
            None,
            &[],
        );
    }

    fn simple_player() -> AnimationPlayer {
        return create_animation_player(simple_clip(), None);
    }

    fn simple_player_ref() -> AnimationPlayerRef {
        return Arc::new(RwLock::new(simple_player()));
    }

    // AnimationSampleAccumulator

    #[test]
    fn accumulator_new_delegates() {
        let method = AnimationSampleAccumulator::new(3, false);
        let free = create_animation_sample_accumulator(3, false);
        assert_eq!(method.components, free.components);
        assert_eq!(method.quaternion, free.quaternion);
    }

    #[test]
    fn accumulator_accumulate_delegates() {
        let mut method = AnimationSampleAccumulator::new(1, false);
        let mut free = create_animation_sample_accumulator(1, false);
        method.accumulate(&[5.0], 2.0);
        accumulate_animation_sample(&mut free, &[5.0], 2.0);
        assert_eq!(method.weight, free.weight);
    }

    #[test]
    fn accumulator_finish_delegates() {
        let mut method = AnimationSampleAccumulator::new(1, false);
        let mut free = create_animation_sample_accumulator(1, false);
        method.accumulate(&[5.0], 1.0);
        accumulate_animation_sample(&mut free, &[5.0], 1.0);
        let mut m_out = [0.0];
        let mut f_out = [0.0];
        method.finish(&mut m_out);
        finish_animation_sample(&mut f_out, &free);
        assert_eq!(m_out, f_out);
    }

    #[test]
    fn accumulator_reset_delegates() {
        let mut method = AnimationSampleAccumulator::new(1, false);
        let mut free = create_animation_sample_accumulator(1, false);
        method.accumulate(&[5.0], 1.0);
        accumulate_animation_sample(&mut free, &[5.0], 1.0);
        method.reset();
        reset_animation_sample_accumulator(&mut free);
        assert_eq!(method.weight, free.weight);
    }

    // AnimationBlendTree

    #[test]
    fn blend_tree_new_delegates() {
        let inputs = [create_animation_blend_tree_input(
            simple_player_ref(),
            1.0,
            false,
        )];
        let method = AnimationBlendTree::new(&inputs);
        let free = create_animation_blend_tree(&inputs);
        assert_eq!(method.inputs.len(), free.inputs.len());
    }

    #[test]
    fn blend_tree_advance_delegates() {
        let inputs = [create_animation_blend_tree_input(
            simple_player_ref(),
            1.0,
            false,
        )];
        let method_tree = AnimationBlendTree::new(&inputs);
        let free_tree = create_animation_blend_tree(&inputs);
        method_tree.advance(0.5);
        advance_animation_blend_tree(&free_tree, 0.5);
        let p_method = method_tree.inputs[0].player.read().unwrap();
        let p_free = free_tree.inputs[0].player.read().unwrap();
        assert_eq!(p_method.time, p_free.time);
    }

    #[test]
    fn blend_tree_sample_delegates() {
        let p = simple_player_ref();
        let inputs = [create_animation_blend_tree_input(p.clone(), 1.0, false)];
        let mut method_tree = AnimationBlendTree::new(&inputs);
        let mut free_tree = create_animation_blend_tree(&inputs);
        let mut m_out = [0.0];
        let mut f_out = [0.0];
        method_tree.sample(&mut m_out, &mut |_, _, _| {});
        sample_animation_blend_tree(&mut f_out, &mut free_tree, &mut |_, _, _| {});
        assert_eq!(m_out, f_out);
    }

    #[test]
    fn blend_tree_sample_channel_delegates() {
        let p = simple_player_ref();
        let inputs = [create_animation_blend_tree_input(p.clone(), 1.0, false)];
        let mut method_tree = AnimationBlendTree::new(&inputs);
        let mut free_tree = create_animation_blend_tree(&inputs);
        let mut m_out = [0.0];
        let mut f_out = [0.0];
        let m_ok = method_tree.sample_channel(&mut m_out, 0);
        let f_ok = sample_animation_blend_tree_channel(&mut f_out, &mut free_tree, 0);
        assert_eq!(m_out, f_out);
        assert_eq!(m_ok, f_ok);
    }

    #[test]
    fn blend_tree_set_input_weight_delegates() {
        let inputs = [create_animation_blend_tree_input(
            simple_player_ref(),
            1.0,
            false,
        )];
        let mut method_tree = AnimationBlendTree::new(&inputs);
        let mut free_tree = create_animation_blend_tree(&inputs);
        method_tree.set_input_weight(0, 0.5);
        set_animation_blend_tree_input_weight(&mut free_tree, 0, 0.5);
        assert_eq!(method_tree.inputs[0].weight, free_tree.inputs[0].weight);
    }

    // AnimationClip

    #[test]
    fn clip_new_delegates() {
        let method = AnimationClip::new(
            vec![create_animation_channel(simple_track(), 1)],
            None,
            &[],
        );
        let free = create_animation_clip(
            vec![create_animation_channel(simple_track(), 1)],
            None,
            &[],
        );
        assert_eq!(method.channels.len(), free.channels.len());
    }

    #[test]
    fn clip_clone_delegates() {
        let clip = simple_clip();
        let method = clip.clone_clip();
        let free = clone_animation_clip(&clip);
        assert_eq!(method.duration, free.duration);
    }

    #[test]
    fn clip_duration_delegates() {
        let clip = simple_clip();
        let method = clip.duration();
        let free = get_animation_clip_duration(&clip);
        assert_eq!(method, free);
    }

    #[test]
    fn clip_sample_delegates() {
        let clip = simple_clip();
        let mut m_out = [0.0];
        let mut f_out = [0.0];
        clip.sample(&mut m_out, 0.5, &mut |_, _, _| {});
        sample_animation_clip(&mut f_out, &clip, 0.5, &mut |_, _, _| {});
        assert_eq!(m_out, f_out);
    }

    // AnimationCrossfade

    #[test]
    fn crossfade_new_delegates() {
        let from = simple_player_ref();
        let to = simple_player_ref();
        let method = AnimationCrossfade::new(from.clone(), to.clone(), 1.0, None);
        let free = create_animation_crossfade(from, to, 1.0, None);
        assert_eq!(method.duration, free.duration);
    }

    #[test]
    fn crossfade_advance_delegates() {
        let from = simple_player_ref();
        let to = simple_player_ref();
        let mut method = AnimationCrossfade::new(from.clone(), to.clone(), 2.0, None);
        let mut free = create_animation_crossfade(from, to, 2.0, None);
        method.advance(0.5);
        advance_animation_crossfade(&mut free, 0.5);
        assert_eq!(method.elapsed, free.elapsed);
    }

    #[test]
    fn crossfade_is_complete_delegates() {
        let from = simple_player_ref();
        let to = simple_player_ref();
        let method = AnimationCrossfade::new(from.clone(), to.clone(), 1.0, None);
        let free = create_animation_crossfade(from, to, 1.0, None);
        assert_eq!(method.is_complete(), is_animation_crossfade_complete(&free));
    }

    #[test]
    fn crossfade_sample_delegates() {
        let from = simple_player_ref();
        let to = simple_player_ref();
        let mut method = AnimationCrossfade::new(from.clone(), to.clone(), 1.0, None);
        let mut free = create_animation_crossfade(from, to, 1.0, None);
        let mut m_out = [0.0];
        let mut f_out = [0.0];
        method.sample(&mut m_out, &mut |_, _, _| {});
        sample_animation_crossfade(&mut f_out, &mut free, &mut |_, _, _| {});
        assert_eq!(m_out, f_out);
    }

    // AnimationLayerStack

    #[test]
    fn layer_stack_new_delegates() {
        let tree = create_animation_blend_tree_ref(&[create_animation_blend_tree_input(
            simple_player_ref(),
            1.0,
            false,
        )]);
        let layers = [create_animation_blend_tree_layer(tree, None)];
        let method = AnimationLayerStack::new(&layers);
        let free = create_animation_layer_stack(&layers);
        assert_eq!(method.layers.len(), free.layers.len());
    }

    #[test]
    fn layer_stack_advance_delegates() {
        let tree = create_animation_blend_tree_ref(&[create_animation_blend_tree_input(
            simple_player_ref(),
            1.0,
            false,
        )]);
        let layers = [create_animation_blend_tree_layer(tree, None)];
        let mut method = AnimationLayerStack::new(&layers);
        let mut free = create_animation_layer_stack(&layers);
        method.advance(0.5);
        advance_animation_layer_stack(&mut free, 0.5);
        assert_eq!(method.advance_scratch.len(), free.advance_scratch.len());
    }

    #[test]
    fn layer_stack_sample_delegates() {
        let tree = create_animation_blend_tree_ref(&[create_animation_blend_tree_input(
            simple_player_ref(),
            1.0,
            false,
        )]);
        let layers = [create_animation_blend_tree_layer(tree, None)];
        let mut method = AnimationLayerStack::new(&layers);
        let mut free = create_animation_layer_stack(&layers);
        let mut m_out = [0.0];
        let mut f_out = [0.0];
        method.sample(&mut m_out, &mut |_, _, _| {});
        sample_animation_layer_stack(&mut f_out, &mut free, &mut |_, _, _| {});
        assert_eq!(m_out, f_out);
    }

    #[test]
    fn layer_stack_sample_channel_delegates() {
        let tree = create_animation_blend_tree_ref(&[create_animation_blend_tree_input(
            simple_player_ref(),
            1.0,
            false,
        )]);
        let layers = [create_animation_blend_tree_layer(tree, None)];
        let mut method = AnimationLayerStack::new(&layers);
        let mut free = create_animation_layer_stack(&layers);
        let mut m_out = [0.0];
        let mut f_out = [0.0];
        let m_ok = method.sample_channel(&mut m_out, 0);
        let f_ok = sample_animation_layer_stack_channel(&mut f_out, &mut free, 0);
        assert_eq!(m_out, f_out);
        assert_eq!(m_ok, f_ok);
    }

    #[test]
    fn layer_stack_set_layer_weight_delegates() {
        let tree = create_animation_blend_tree_ref(&[create_animation_blend_tree_input(
            simple_player_ref(),
            1.0,
            false,
        )]);
        let layers = [create_animation_blend_tree_layer(tree, None)];
        let mut method = AnimationLayerStack::new(&layers);
        let mut free = create_animation_layer_stack(&layers);
        method.set_layer_weight(0, 0.5);
        set_animation_layer_weight(&mut free, 0, 0.5);
        assert_eq!(method.layers[0].weight, free.layers[0].weight);
    }

    // AnimationPlayer

    #[test]
    fn player_new_delegates() {
        let method = AnimationPlayer::new(simple_clip(), None);
        let free = create_animation_player(simple_clip(), None);
        assert_eq!(method.time, free.time);
        assert_eq!(
            method.clip.read().unwrap().channels.len(),
            free.clip.read().unwrap().channels.len()
        );
    }

    #[test]
    fn player_advance_delegates() {
        let mut method = AnimationPlayer::new(simple_clip(), None);
        let mut free = create_animation_player(simple_clip(), None);
        method.advance(0.5);
        advance_animation_player(&mut free, 0.5);
        assert_eq!(method.time, free.time);
    }

    #[test]
    fn player_clone_delegates() {
        let player = simple_player();
        let method = player.clone_player();
        let free = clone_animation_player(&player);
        assert_eq!(method.time, free.time);
    }

    #[test]
    fn player_enable_signals_delegates() {
        let mut method = AnimationPlayer::new(simple_clip(), None);
        let mut free = create_animation_player(simple_clip(), None);
        method.enable_signals();
        enable_animation_player_signals(&mut free);
        assert_eq!(method.on_event.is_some(), free.on_event.is_some());
    }

    #[test]
    fn player_normalized_time_delegates() {
        let mut method = AnimationPlayer::new(simple_clip(), None);
        let mut free = create_animation_player(simple_clip(), None);
        method.advance(0.5);
        advance_animation_player(&mut free, 0.5);
        assert_eq!(method.normalized_time(), get_animation_player_normalized_time(&free));
    }

    #[test]
    fn player_play_delegates() {
        let mut method = AnimationPlayer::new(simple_clip(), None);
        let mut free = create_animation_player(simple_clip(), None);
        method.stop();
        stop_animation_player(&mut free);
        method.play();
        play_animation_player(&mut free);
        assert_eq!(method.playing, free.playing);
    }

    #[test]
    fn player_seek_delegates() {
        let mut method = AnimationPlayer::new(simple_clip(), None);
        let mut free = create_animation_player(simple_clip(), None);
        method.seek(0.75);
        seek_animation_player(&mut free, 0.75);
        assert_eq!(method.time, free.time);
    }

    #[test]
    fn player_stop_delegates() {
        let mut method = AnimationPlayer::new(simple_clip(), None);
        let mut free = create_animation_player(simple_clip(), None);
        method.stop();
        stop_animation_player(&mut free);
        assert_eq!(method.playing, free.playing);
    }

    // AnimationRootMotionExtractor

    #[test]
    fn root_motion_new_delegates() {
        let clip = Arc::new(RwLock::new(simple_clip()));
        let method = AnimationRootMotionExtractor::new(&clip, 0);
        let free = create_animation_root_motion_extractor(&clip, 0);
        assert_eq!(method.channel_index, free.channel_index);
    }

    #[test]
    fn root_motion_extract_delegates() {
        let clip = Arc::new(RwLock::new(simple_clip()));
        let mut method = AnimationRootMotionExtractor::new(&clip, 0);
        let mut free = create_animation_root_motion_extractor(&clip, 0);
        let mut m_out = [0.0];
        let mut f_out = [0.0];
        let m_ok = method.extract(&mut m_out, 0.0, 0.5);
        let f_ok = extract_animation_root_motion(&mut f_out, &mut free, 0.0, 0.5);
        assert_eq!(m_out, f_out);
        assert_eq!(m_ok, f_ok);
    }

    // AnimationStateMachine

    #[test]
    fn state_machine_new_delegates() {
        let tree = create_animation_blend_tree_ref(&[]);
        let states = [create_animation_state_machine_state("only", tree)];
        let method = AnimationStateMachine::new(&states, None);
        let free = create_animation_state_machine(&states, None);
        assert_eq!(method.states.len(), free.states.len());
    }

    #[test]
    fn state_machine_advance_delegates() {
        let p = simple_player_ref();
        let inputs = [create_animation_blend_tree_input(p, 1.0, false)];
        let tree = create_animation_blend_tree_ref(&inputs);
        let states = [create_animation_state_machine_state("only", tree)];
        let mut method = AnimationStateMachine::new(&states, None);
        let mut free = create_animation_state_machine(&states, None);
        method.advance(0.5);
        advance_animation_state_machine(&mut free, 0.5);
        assert_eq!(method.advance_scratch.len(), free.advance_scratch.len());
    }

    #[test]
    fn state_machine_current_state_delegates() {
        let tree = create_animation_blend_tree_ref(&[]);
        let states = [create_animation_state_machine_state("only", tree)];
        let method = AnimationStateMachine::new(&states, None);
        let free = create_animation_state_machine(&states, None);
        assert_eq!(
            method.current_state().name,
            get_animation_state_machine_current_state(&free).name
        );
    }

    #[test]
    fn state_machine_is_transitioning_delegates() {
        let tree = create_animation_blend_tree_ref(&[]);
        let states = [create_animation_state_machine_state("only", tree)];
        let method = AnimationStateMachine::new(&states, None);
        let free = create_animation_state_machine(&states, None);
        assert_eq!(
            method.is_transitioning(),
            is_animation_state_machine_transitioning(&free)
        );
    }

    #[test]
    fn state_machine_sample_delegates() {
        let p = simple_player_ref();
        let inputs = [create_animation_blend_tree_input(p, 1.0, false)];
        let tree = create_animation_blend_tree_ref(&inputs);
        let states = [create_animation_state_machine_state("only", tree)];
        let mut method = AnimationStateMachine::new(&states, None);
        let mut free = create_animation_state_machine(&states, None);
        let mut m_out = [0.0];
        let mut f_out = [0.0];
        method.sample(&mut m_out, &mut |_, _, _| {});
        sample_animation_state_machine(&mut f_out, &mut free, &mut |_, _, _| {});
        assert_eq!(m_out, f_out);
    }

    #[test]
    fn state_machine_sample_channel_delegates() {
        let p = simple_player_ref();
        let inputs = [create_animation_blend_tree_input(p, 1.0, false)];
        let tree = create_animation_blend_tree_ref(&inputs);
        let states = [create_animation_state_machine_state("only", tree)];
        let mut method = AnimationStateMachine::new(&states, None);
        let mut free = create_animation_state_machine(&states, None);
        let mut m_out = [0.0];
        let mut f_out = [0.0];
        let m_ok = method.sample_channel(&mut m_out, 0);
        let f_ok = sample_animation_state_machine_channel(&mut f_out, &mut free, 0);
        assert_eq!(m_out, f_out);
        assert_eq!(m_ok, f_ok);
    }

    #[test]
    fn state_machine_transition_delegates() {
        let p1 = simple_player_ref();
        let p2 = simple_player_ref();
        let inputs1 = [create_animation_blend_tree_input(p1, 1.0, false)];
        let inputs2 = [create_animation_blend_tree_input(p2, 1.0, false)];
        let tree1 = create_animation_blend_tree_ref(&inputs1);
        let tree2 = create_animation_blend_tree_ref(&inputs2);
        let states = [
            create_animation_state_machine_state("a", tree1),
            create_animation_state_machine_state("b", tree2),
        ];
        let mut method = AnimationStateMachine::new(&states, None);
        let mut free = create_animation_state_machine(&states, None);
        let m_ok = method.transition(StateRef::Name("b".to_string()), 1.0, None);
        let f_ok = transition_animation_state_machine(
            &mut free,
            StateRef::Name("b".to_string()),
            1.0,
            None,
        );
        assert_eq!(m_ok, f_ok);
        assert_eq!(method.is_transitioning(), is_animation_state_machine_transitioning(&free));
    }

    // AnimationTrack

    #[test]
    fn track_new_delegates() {
        let opts = CreateAnimationTrackOpts {
            times: vec![0.0, 1.0],
            values: vec![0.0, 10.0],
            components: None,
            interpolation: None,
            quaternion: None,
            easing: None,
            segment_easings: None,
        };
        let method = AnimationTrack::new(opts.clone());
        let free = create_animation_track(opts);
        assert_eq!(method.times, free.times);
        assert_eq!(method.values, free.values);
    }

    #[test]
    fn track_clone_delegates() {
        let track = simple_track();
        let method = track.clone_track();
        let free = clone_animation_track(&track);
        assert_eq!(method.times, free.times);
        assert_eq!(method.values, free.values);
    }

    #[test]
    fn track_sample_delegates() {
        let track = simple_track();
        let mut m_out = [0.0];
        let mut f_out = [0.0];
        track.sample(&mut m_out, 0.5);
        sample_animation_track(&mut f_out, &track, 0.5);
        assert_eq!(m_out, f_out);
    }

    #[test]
    fn track_trim_delegates() {
        let track = simple_track();
        let method = track.trim(0.25, 0.75);
        let free = trim_animation_track(&track, 0.25, 0.75);
        assert_eq!(method.times, free.times);
        assert_eq!(method.values, free.values);
    }

    #[test]
    fn track_validate_delegates() {
        let track = simple_track();
        let method = track.validate();
        let free = validate_animation_track(&track);
        assert_eq!(method.is_none(), free.is_none());
    }
}

impl AnimationSampleAccumulator {
    pub fn new(components: usize, quaternion: bool) -> Self {
        return create_animation_sample_accumulator(components, quaternion);
    }

    pub fn accumulate(&mut self, sample: &[f32], weight: f32) {
        accumulate_animation_sample(self, sample, weight);
    }

    pub fn finish(&self, out: &mut [f32]) {
        finish_animation_sample(out, self);
    }

    pub fn reset(&mut self) {
        reset_animation_sample_accumulator(self);
    }
}

impl AnimationBlendTree {
    pub fn new(inputs: &[AnimationBlendTreeInput]) -> Self {
        return create_animation_blend_tree(inputs);
    }

    pub fn advance(&self, dt: f32) {
        advance_animation_blend_tree(self, dt);
    }

    pub fn sample(
        &mut self,
        out: &mut [f32],
        visit: &mut dyn FnMut(&[f32], &AnimationChannel, usize),
    ) {
        sample_animation_blend_tree(out, self, visit);
    }

    pub fn sample_channel(&mut self, out: &mut [f32], channel_index: usize) -> bool {
        return sample_animation_blend_tree_channel(out, self, channel_index);
    }

    pub fn set_input_weight(&mut self, input_index: usize, weight: f32) {
        set_animation_blend_tree_input_weight(self, input_index, weight);
    }
}

impl AnimationClip {
    pub fn new(
        channels: Vec<AnimationChannel>,
        duration: Option<f32>,
        events: &[AnimationClipEvent],
    ) -> Self {
        return create_animation_clip(channels, duration, events);
    }

    pub fn clone_clip(&self) -> Self {
        return clone_animation_clip(self);
    }

    pub fn duration(&self) -> f32 {
        return get_animation_clip_duration(self);
    }

    pub fn sample(
        &self,
        out: &mut [f32],
        time: f32,
        visit: &mut dyn FnMut(&[f32], &AnimationChannel, usize),
    ) {
        sample_animation_clip(out, self, time, visit);
    }
}

impl AnimationCrossfade {
    pub fn new(
        from: AnimationPlayerRef,
        to: AnimationPlayerRef,
        duration: f32,
        opts: Option<&AnimationCrossfadeOptions>,
    ) -> Self {
        return create_animation_crossfade(from, to, duration, opts);
    }

    pub fn advance(&mut self, dt: f32) {
        advance_animation_crossfade(self, dt);
    }

    pub fn is_complete(&self) -> bool {
        return is_animation_crossfade_complete(self);
    }

    pub fn sample(
        &mut self,
        out: &mut [f32],
        visit: &mut dyn FnMut(&[f32], &AnimationChannel, usize),
    ) {
        sample_animation_crossfade(out, self, visit);
    }
}

impl AnimationLayerStack {
    pub fn new(layers: &[AnimationLayer]) -> Self {
        return create_animation_layer_stack(layers);
    }

    pub fn advance(&mut self, dt: f32) {
        advance_animation_layer_stack(self, dt);
    }

    pub fn sample(
        &mut self,
        out: &mut [f32],
        visit: &mut dyn FnMut(&[f32], &AnimationChannel, usize),
    ) {
        sample_animation_layer_stack(out, self, visit);
    }

    pub fn sample_channel(&mut self, out: &mut [f32], channel_index: usize) -> bool {
        return sample_animation_layer_stack_channel(out, self, channel_index);
    }

    pub fn set_layer_weight(&mut self, layer_index: usize, weight: f32) {
        set_animation_layer_weight(self, layer_index, weight);
    }
}

impl AnimationPlayer {
    pub fn new(clip: AnimationClip, opts: Option<&AnimationPlayerOptions>) -> Self {
        return create_animation_player(clip, opts);
    }

    pub fn advance(&mut self, dt: f32) {
        advance_animation_player(self, dt);
    }

    pub fn clone_player(&self) -> Self {
        return clone_animation_player(self);
    }

    pub fn enable_signals(&mut self) {
        enable_animation_player_signals(self);
    }

    pub fn normalized_time(&self) -> f32 {
        return get_animation_player_normalized_time(self);
    }

    pub fn play(&mut self) {
        play_animation_player(self);
    }

    pub fn seek(&mut self, time: f32) {
        seek_animation_player(self, time);
    }

    pub fn stop(&mut self) {
        stop_animation_player(self);
    }
}

impl AnimationRootMotionExtractor {
    pub fn new(clip: &Ref<AnimationClip>, channel_index: usize) -> Self {
        return create_animation_root_motion_extractor(clip, channel_index);
    }

    pub fn extract(&mut self, out: &mut [f32], start_time: f32, end_time: f32) -> bool {
        return extract_animation_root_motion(out, self, start_time, end_time);
    }
}

impl AnimationStateMachine {
    pub fn new(states: &[AnimationStateMachineState], initial_state: Option<StateRef>) -> Self {
        return create_animation_state_machine(states, initial_state);
    }

    pub fn advance(&mut self, dt: f32) {
        advance_animation_state_machine(self, dt);
    }

    pub fn current_state(&self) -> &AnimationStateMachineState {
        return get_animation_state_machine_current_state(self);
    }

    pub fn is_transitioning(&self) -> bool {
        return is_animation_state_machine_transitioning(self);
    }

    pub fn sample(
        &mut self,
        out: &mut [f32],
        visit: &mut dyn FnMut(&[f32], &AnimationChannel, usize),
    ) {
        sample_animation_state_machine(out, self, visit);
    }

    pub fn sample_channel(&mut self, out: &mut [f32], channel_index: usize) -> bool {
        return sample_animation_state_machine_channel(out, self, channel_index);
    }

    pub fn transition(
        &mut self,
        to_state: StateRef,
        duration: f32,
        curve: Option<EasingFn>,
    ) -> bool {
        return transition_animation_state_machine(self, to_state, duration, curve);
    }
}

impl AnimationTrack {
    pub fn new(opts: CreateAnimationTrackOpts) -> Self {
        return create_animation_track(opts);
    }

    pub fn clone_track(&self) -> Self {
        return clone_animation_track(self);
    }

    pub fn sample(&self, out: &mut [f32], t: f32) {
        sample_animation_track(out, self, t);
    }

    pub fn trim(&self, start_time: f32, end_time: f32) -> Self {
        return trim_animation_track(self, start_time, end_time);
    }

    pub fn validate(&self) -> Option<Vec<AnimationTrackValidationDiagnostic>> {
        return validate_animation_track(self);
    }
}
