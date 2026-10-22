use flight_entity::Ref;
use flight_hostcapability::HostSpawnCapability;
use flight_video::HostVideoCapability;

use crate::audio_channel::*;
use crate::audio_mixer::*;
use crate::enable_audio_mixer_guards::*;
use crate::media_channel_signals::*;
use crate::types::*;
use crate::video_channel::*;
use crate::video_channel_runtime::*;

#[cfg(test)]
#[path = "sugar_tests.rs"]
mod sugar_tests;

pub trait AudioChannelMethods {
    fn clear_loop_region(&self);
    fn current_time(&self) -> f32;
    fn destroy(&self);
    fn duration(&self) -> f32;
    fn enable_signals(&self) -> Ref<MediaChannelSignals>;
    fn fade_gain(
        &self,
        host_audio_device: &HostAudioDeviceCapability,
        target_gain: f32,
        duration_ms: f32,
    );
    fn is_muted(&self) -> bool;
    fn is_playing(&self) -> bool;
    fn pause(&self);
    fn resume(&self);
    fn set_current_time(&self, value: f32) -> f32;
    fn set_gain(&self, value: f32) -> f32;
    fn set_loop_region(&self, start_ms: f32, end_ms: f32) -> bool;
    fn set_muted(&self, value: bool) -> bool;
    fn set_pan(&self, value: f32) -> f32;
    fn set_playback_rate(&self, value: f32) -> f32;
    fn signals(&self) -> Option<Ref<MediaChannelSignals>>;
    fn source_handle(&self) -> AudioSourceHandle;
    fn stop(&self);
}

impl AudioChannelMethods for Ref<AudioChannel> {
    fn clear_loop_region(&self) {
        clear_audio_channel_loop_region(self);
    }
    fn current_time(&self) -> f32 {
        return get_audio_channel_current_time(self);
    }
    fn destroy(&self) {
        destroy_audio_channel(self);
    }
    fn duration(&self) -> f32 {
        return get_audio_channel_duration(self);
    }
    fn enable_signals(&self) -> Ref<MediaChannelSignals> {
        return enable_audio_channel_signals(self);
    }
    fn fade_gain(
        &self,
        host_audio_device: &HostAudioDeviceCapability,
        target_gain: f32,
        duration_ms: f32,
    ) {
        fade_audio_channel_gain(host_audio_device, self, target_gain, duration_ms);
    }
    fn is_muted(&self) -> bool {
        return is_audio_channel_muted(self);
    }
    fn is_playing(&self) -> bool {
        return is_audio_channel_playing(self);
    }
    fn pause(&self) {
        pause_audio_channel(self);
    }
    fn resume(&self) {
        resume_audio_channel(self);
    }
    fn set_current_time(&self, value: f32) -> f32 {
        return set_audio_channel_current_time(self, value);
    }
    fn set_gain(&self, value: f32) -> f32 {
        return set_audio_channel_gain(self, value);
    }
    fn set_loop_region(&self, start_ms: f32, end_ms: f32) -> bool {
        return set_audio_channel_loop_region(self, start_ms, end_ms);
    }
    fn set_muted(&self, value: bool) -> bool {
        return set_audio_channel_muted(self, value);
    }
    fn set_pan(&self, value: f32) -> f32 {
        return set_audio_channel_pan(self, value);
    }
    fn set_playback_rate(&self, value: f32) -> f32 {
        return set_audio_channel_playback_rate(self, value);
    }
    fn signals(&self) -> Option<Ref<MediaChannelSignals>> {
        return get_audio_channel_signals(self);
    }
    fn source_handle(&self) -> AudioSourceHandle {
        return get_audio_channel_source_handle(self);
    }
    fn stop(&self) {
        stop_audio_channel(self);
    }
}

pub trait AudioBusMethods {
    fn add_to_mixer(&self, host_audio_mixer: &HostAudioMixerCapability, mixer: &Ref<AudioMixer>);
    fn fade_gain(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        mixer: &Ref<AudioMixer>,
        target_gain: f32,
        duration_ms: f32,
    );
    fn set_gain(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        guard_state: &AudioMixerGuardStateRef,
        value: f32,
    ) -> f32;
    fn set_muted(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        guard_state: &AudioMixerGuardStateRef,
        muted: bool,
    ) -> bool;
    fn set_pan(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        guard_state: &AudioMixerGuardStateRef,
        value: f32,
    ) -> f32;
}

impl AudioBusMethods for Ref<AudioBus> {
    fn add_to_mixer(&self, host_audio_mixer: &HostAudioMixerCapability, mixer: &Ref<AudioMixer>) {
        add_audio_bus_to_mixer(host_audio_mixer, mixer, self);
    }
    fn fade_gain(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        mixer: &Ref<AudioMixer>,
        target_gain: f32,
        duration_ms: f32,
    ) {
        fade_audio_bus_gain(host_audio_mixer, mixer, self, target_gain, duration_ms);
    }
    fn set_gain(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        guard_state: &AudioMixerGuardStateRef,
        value: f32,
    ) -> f32 {
        return set_audio_bus_gain(host_audio_mixer, guard_state, self, value);
    }
    fn set_muted(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        guard_state: &AudioMixerGuardStateRef,
        muted: bool,
    ) -> bool {
        return set_audio_bus_muted(host_audio_mixer, guard_state, self, muted);
    }
    fn set_pan(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        guard_state: &AudioMixerGuardStateRef,
        value: f32,
    ) -> f32 {
        return set_audio_bus_pan(host_audio_mixer, guard_state, self, value);
    }
}

pub trait AudioMixerGuardStateMethods {
    fn disable(&self);
    // flight-lint: allow(f64) guard sugar forwards the flight-log millisecond clock unchanged
    fn enable(
        &self,
        log_state: &flight_log::LogStateRef,
        clock: std::sync::Arc<dyn Fn() -> f64 + Send + Sync>,
    );
    fn set_guard(&self, guard: Option<AudioBusMixerGuard>);
}

impl AudioMixerGuardStateMethods for AudioMixerGuardStateRef {
    fn disable(&self) {
        disable_audio_mixer_guards(self);
    }
    // flight-lint: allow(f64) guard sugar forwards the flight-log millisecond clock unchanged
    fn enable(
        &self,
        log_state: &flight_log::LogStateRef,
        clock: std::sync::Arc<dyn Fn() -> f64 + Send + Sync>,
    ) {
        enable_audio_mixer_guards(self, log_state, clock);
    }
    fn set_guard(&self, guard: Option<AudioBusMixerGuard>) {
        set_audio_bus_mixer_guard(self, guard);
    }
}

pub trait AudioMixerMethods {
    fn active_channels(&self, out: &mut Vec<Ref<AudioChannel>>);
    fn add_bus(&self, host_audio_mixer: &HostAudioMixerCapability, bus: &Ref<AudioBus>);
    fn destroy(&self, host_audio_mixer: &HostAudioMixerCapability);
    fn fade_bus_gain(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        bus: &Ref<AudioBus>,
        target_gain: f32,
        duration_ms: f32,
    );
    fn pause_all_channels(&self);
    fn resume_all_channels(&self);
    fn route_channel_to_bus(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        channel: &Ref<AudioChannel>,
        bus: &Ref<AudioBus>,
    );
    fn set_master_gain(&self, host_audio_mixer: &HostAudioMixerCapability, value: f32) -> f32;
    fn set_master_muted(&self, host_audio_mixer: &HostAudioMixerCapability, muted: bool) -> bool;
    fn stop_all_channels(&self);
    fn unroute_channel_from_bus(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        channel: &Ref<AudioChannel>,
    );
}

impl AudioMixerMethods for Ref<AudioMixer> {
    fn active_channels(&self, out: &mut Vec<Ref<AudioChannel>>) {
        get_audio_mixer_active_channels(out, self);
    }
    fn add_bus(&self, host_audio_mixer: &HostAudioMixerCapability, bus: &Ref<AudioBus>) {
        add_audio_bus_to_mixer(host_audio_mixer, self, bus);
    }
    fn destroy(&self, host_audio_mixer: &HostAudioMixerCapability) {
        destroy_audio_mixer(host_audio_mixer, self);
    }
    fn fade_bus_gain(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        bus: &Ref<AudioBus>,
        target_gain: f32,
        duration_ms: f32,
    ) {
        fade_audio_bus_gain(host_audio_mixer, self, bus, target_gain, duration_ms);
    }
    fn pause_all_channels(&self) {
        pause_all_audio_mixer_channels(self);
    }
    fn resume_all_channels(&self) {
        resume_all_audio_mixer_channels(self);
    }
    fn route_channel_to_bus(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        channel: &Ref<AudioChannel>,
        bus: &Ref<AudioBus>,
    ) {
        route_audio_channel_to_mixer_bus(host_audio_mixer, self, channel, bus);
    }
    fn set_master_gain(&self, host_audio_mixer: &HostAudioMixerCapability, value: f32) -> f32 {
        return set_audio_mixer_master_gain(host_audio_mixer, self, value);
    }
    fn set_master_muted(&self, host_audio_mixer: &HostAudioMixerCapability, muted: bool) -> bool {
        return set_audio_mixer_master_muted(host_audio_mixer, self, muted);
    }
    fn stop_all_channels(&self) {
        stop_all_audio_mixer_channels(self);
    }
    fn unroute_channel_from_bus(
        &self,
        host_audio_mixer: &HostAudioMixerCapability,
        channel: &Ref<AudioChannel>,
    ) {
        unroute_audio_channel_from_mixer_bus(host_audio_mixer, self, channel);
    }
}

impl AudioBus {
    pub fn new() -> Ref<AudioBus> {
        return create_audio_bus();
    }
}

impl AudioMixer {
    pub fn new(
        host_audio_mixer: &HostAudioMixerCapability,
        device: AudioDeviceHandle,
        options: Option<&AudioMixerOptions>,
    ) -> Ref<AudioMixer> {
        return create_audio_mixer(host_audio_mixer, device, options);
    }
}

impl VideoChannelRuntimeState {
    pub fn new() -> VideoChannelRuntimeStateRef {
        return create_video_channel_runtime_state();
    }
}

pub trait VideoChannelMethods {
    fn current_time(&self, host_video: &HostVideoCapability) -> f32;
    fn destroy(&self, host_video: &HostVideoCapability);
    fn duration(&self) -> f32;
    fn enable_signals(&self) -> Ref<MediaChannelSignals>;
    fn height(&self, host_video: &HostVideoCapability) -> f32;
    fn is_muted(&self) -> bool;
    fn is_playing(&self) -> bool;
    fn pause(&self, host_video: &HostVideoCapability);
    fn resume(&self, host_video: &HostVideoCapability, host_spawn: &HostSpawnCapability);
    fn set_current_time(&self, host_video: &HostVideoCapability, value: f32) -> f32;
    fn set_gain(&self, host_video: &HostVideoCapability, value: f32) -> f32;
    fn set_muted(&self, host_video: &HostVideoCapability, value: bool) -> bool;
    fn set_playback_rate(&self, host_video: &HostVideoCapability, value: f32) -> f32;
    fn signals(&self) -> Option<Ref<MediaChannelSignals>>;
    fn stop(&self, host_video: &HostVideoCapability);
    fn width(&self, host_video: &HostVideoCapability) -> f32;
}

impl VideoChannelMethods for Ref<VideoChannel> {
    fn current_time(&self, host_video: &HostVideoCapability) -> f32 {
        return get_video_channel_current_time(host_video, self);
    }
    fn destroy(&self, host_video: &HostVideoCapability) {
        destroy_video_channel(host_video, self);
    }
    fn duration(&self) -> f32 {
        return get_video_channel_duration(self);
    }
    fn enable_signals(&self) -> Ref<MediaChannelSignals> {
        return enable_video_channel_signals(self);
    }
    fn height(&self, host_video: &HostVideoCapability) -> f32 {
        return get_video_channel_height(host_video, self);
    }
    fn is_muted(&self) -> bool {
        return is_video_channel_muted(self);
    }
    fn is_playing(&self) -> bool {
        return is_video_channel_playing(self);
    }
    fn pause(&self, host_video: &HostVideoCapability) {
        pause_video_channel(host_video, self);
    }
    fn resume(&self, host_video: &HostVideoCapability, host_spawn: &HostSpawnCapability) {
        resume_video_channel(host_video, host_spawn, self);
    }
    fn set_current_time(&self, host_video: &HostVideoCapability, value: f32) -> f32 {
        return set_video_channel_current_time(host_video, self, value);
    }
    fn set_gain(&self, host_video: &HostVideoCapability, value: f32) -> f32 {
        return set_video_channel_gain(host_video, self, value);
    }
    fn set_muted(&self, host_video: &HostVideoCapability, value: bool) -> bool {
        return set_video_channel_muted(host_video, self, value);
    }
    fn set_playback_rate(&self, host_video: &HostVideoCapability, value: f32) -> f32 {
        return set_video_channel_playback_rate(host_video, self, value);
    }
    fn signals(&self) -> Option<Ref<MediaChannelSignals>> {
        return get_video_channel_signals(self);
    }
    fn stop(&self, host_video: &HostVideoCapability) {
        stop_video_channel(host_video, self);
    }
    fn width(&self, host_video: &HostVideoCapability) -> f32 {
        return get_video_channel_width(host_video, self);
    }
}
