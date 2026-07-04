//! Audio mixer — bus routing, gain, pan, mute, and batch channel operations.
//!
//! This is a faithful port of `packages/media/src/audioMixer.ts`. The TS
//! version wires a Web Audio graph (`GainNode`, `StereoPannerNode`,
//! `AudioContext.destination`). Rust has no Web Audio substrate, so the mixer
//! is a pure data structure: it tracks buses, gain/pan/mute state, and
//! channel-to-bus routing. Actual audio mixing is delegated to the audio
//! backend.
//!
//! The mixer owns its routed channels. `route_audio_channel_to_mixer_bus`
//! takes ownership of an [`AudioChannel`]; `unroute_audio_channel_from_mixer_bus`
//! returns it. This models the TS shared-reference semantics via Rust ownership.

use flighthq_types::AudioBus;
use flighthq_types::AudioBusOptions;
use flighthq_types::AudioChannel;
use flighthq_types::AudioChannelState;
use flighthq_types::AudioMixer;
use flighthq_types::AudioMixerChannelEntry;
use flighthq_types::AudioMixerOptions;

use crate::audio_channel::pause_audio_channel;
use crate::audio_channel::resume_audio_channel;
use crate::audio_channel::stop_audio_channel;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Registers `bus` in the mixer. No-op if a bus with the same name is already
/// registered.
pub fn add_audio_bus_to_mixer(mixer: &mut AudioMixer, bus: AudioBus) {
    if mixer.buses.iter().any(|b| b.name == bus.name) {
        return;
    }
    mixer.buses.push(bus);
}

/// Connects the channel's output to the backend destination associated with
/// `bus`. In the TS version this calls `connectAudioChannelToNode`; in Rust
/// the backend is notified through the audio backend seam.
pub fn connect_audio_channel_to_node_via_mixer(channel: &AudioChannel, _bus: &AudioBus) {
    // In the Rust port, actual audio graph wiring is handled by the backend.
    // The mixer tracks the routing; the backend reads the routing state.
    crate::audio_channel::connect_audio_channel_to_node(channel, 0);
}

/// Creates an [`AudioBus`] with the given options, defaulting to gain 1,
/// unmuted, empty name, and centered pan.
pub fn create_audio_bus(options: Option<&AudioBusOptions>) -> AudioBus {
    AudioBus {
        gain: options.and_then(|o| o.gain).unwrap_or(1.0),
        muted: options.and_then(|o| o.muted).unwrap_or(false),
        name: options.and_then(|o| o.name.clone()).unwrap_or_default(),
        pan: options.and_then(|o| o.pan).unwrap_or(0.0),
    }
}

/// Creates an [`AudioMixer`] with the given options, defaulting to master
/// gain 1 and unmuted.
///
/// The TS version takes an `AudioContext` for Web Audio graph wiring. The
/// Rust port has no audio context; the mixer is a pure data structure.
pub fn create_audio_mixer(options: Option<&AudioMixerOptions>) -> AudioMixer {
    AudioMixer {
        master_gain: options.and_then(|o| o.master_gain).unwrap_or(1.0),
        master_muted: options.and_then(|o| o.master_muted).unwrap_or(false),
        buses: Vec::new(),
        channels: Vec::new(),
    }
}

/// Tears down the mixer: stops all routed channels, clears buses and
/// channel entries. Safe to call on an already-destroyed mixer (no-op on
/// an empty mixer).
pub fn destroy_audio_mixer(mixer: &mut AudioMixer) {
    for entry in &mut mixer.channels {
        stop_audio_channel(&mut entry.channel);
    }
    mixer.channels.clear();
    mixer.buses.clear();
}

/// Schedules a gain fade on the bus. In the TS version this ramps the bus
/// `GainNode` over `duration_ms`; the Rust port updates the bus gain
/// immediately (a real-time backend may interpolate). The bus data is
/// updated to `target_gain` regardless.
pub fn fade_audio_bus_gain(
    mixer: &mut AudioMixer,
    bus: &mut AudioBus,
    target_gain: f32,
    _duration_ms: f64,
) {
    bus.gain = target_gain;
    // Update the mixer's copy of the bus if it exists.
    if let Some(stored) = mixer.buses.iter_mut().find(|b| b.name == bus.name) {
        stored.gain = target_gain;
    }
}

/// Returns references to the active channels in the mixer.
pub fn get_audio_mixer_active_channels(mixer: &AudioMixer) -> Vec<&AudioChannel> {
    mixer.channels.iter().map(|e| &e.channel).collect()
}

/// Pauses all playing channels in the mixer.
pub fn pause_all_audio_mixer_channels(mixer: &mut AudioMixer) {
    for entry in &mut mixer.channels {
        if entry.channel.state == AudioChannelState::Playing {
            pause_audio_channel(&mut entry.channel);
        }
    }
}

/// Resumes all paused channels in the mixer.
pub fn resume_all_audio_mixer_channels(mixer: &mut AudioMixer) {
    for entry in &mut mixer.channels {
        if entry.channel.state == AudioChannelState::Paused {
            resume_audio_channel(&mut entry.channel);
        }
    }
}

/// Routes `channel` through `bus` in the mixer. The mixer takes ownership
/// of the channel. If the bus is not yet registered, it is added
/// automatically. Returns the index of the channel entry within the mixer
/// (use this index to unroute later).
pub fn route_audio_channel_to_mixer_bus(
    mixer: &mut AudioMixer,
    channel: AudioChannel,
    bus: &AudioBus,
) -> usize {
    // Ensure the bus is registered.
    if !mixer.buses.iter().any(|b| b.name == bus.name) {
        mixer.buses.push(bus.clone());
    }
    let index = mixer.channels.len();
    mixer.channels.push(AudioMixerChannelEntry {
        channel,
        bus_name: bus.name.clone(),
    });
    index
}

/// Sets the bus gain and returns the new value.
pub fn set_audio_bus_gain(bus: &mut AudioBus, value: f32) -> f32 {
    bus.gain = value;
    bus.gain
}

/// Sets the bus muted state and returns it.
pub fn set_audio_bus_muted(bus: &mut AudioBus, muted: bool) -> bool {
    bus.muted = muted;
    bus.muted
}

/// Sets the bus pan (clamped to `[-1, 1]`) and returns the clamped value.
pub fn set_audio_bus_pan(bus: &mut AudioBus, value: f32) -> f32 {
    bus.pan = value.clamp(-1.0, 1.0);
    bus.pan
}

/// Sets the mixer master gain and returns it.
pub fn set_audio_mixer_master_gain(mixer: &mut AudioMixer, value: f32) -> f32 {
    mixer.master_gain = value;
    mixer.master_gain
}

/// Sets the mixer master muted state and returns it.
pub fn set_audio_mixer_master_muted(mixer: &mut AudioMixer, muted: bool) -> bool {
    mixer.master_muted = muted;
    mixer.master_muted
}

/// Stops all routed channels and clears the active set.
pub fn stop_all_audio_mixer_channels(mixer: &mut AudioMixer) {
    for entry in &mut mixer.channels {
        entry.channel.current_time = 0.0;
        entry.channel.state = AudioChannelState::Stopped;
    }
    mixer.channels.clear();
}

/// Removes the channel at `index` from the mixer and returns ownership.
/// Returns `None` if the index is out of bounds.
pub fn unroute_audio_channel_from_mixer_bus(
    mixer: &mut AudioMixer,
    index: usize,
) -> Option<AudioChannel> {
    if index >= mixer.channels.len() {
        return None;
    }
    Some(mixer.channels.remove(index).channel)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_channel::AudioBackend;
    use crate::audio_channel::play_audio_resource;
    use crate::audio_channel::set_audio_backend;
    use flighthq_types::AudioResource;
    use serial_test::serial;
    use std::sync::Arc;
    use std::sync::Mutex;
    use std::sync::atomic::AtomicBool;
    use std::sync::atomic::AtomicUsize;
    use std::sync::atomic::Ordering;

    fn buffered_resource() -> AudioResource {
        AudioResource {
            buffer: Some(vec![0u8; 8]),
        }
    }

    struct TestBackend {
        started_position_ms: Mutex<f64>,
        started: AtomicUsize,
        stopped: AtomicBool,
    }

    impl AudioBackend for TestBackend {
        fn duration_ms(&self, _source: &AudioResource) -> f64 {
            1000.0
        }
        fn live_position_ms(&self, _channel: &AudioChannel) -> Option<f64> {
            Some(*self.started_position_ms.lock().unwrap())
        }
        fn start(&self, channel: &AudioChannel) {
            *self.started_position_ms.lock().unwrap() = channel.current_time;
            self.started.fetch_add(1, Ordering::SeqCst);
        }
        fn stop(&self, _channel: &AudioChannel) {
            self.stopped.store(true, Ordering::SeqCst);
        }
    }

    fn install_test_backend() -> Arc<TestBackend> {
        let backend = Arc::new(TestBackend {
            started_position_ms: Mutex::new(0.0),
            started: AtomicUsize::new(0),
            stopped: AtomicBool::new(false),
        });
        set_audio_backend(backend.clone());
        backend
    }

    struct NoopBackend;
    impl AudioBackend for NoopBackend {}

    fn reset_backend() {
        set_audio_backend(Arc::new(NoopBackend));
    }

    #[test]
    fn create_audio_bus_defaults() {
        let bus = create_audio_bus(None);
        assert_eq!(bus.gain, 1.0);
        assert!(!bus.muted);
        assert_eq!(bus.name, "");
        assert_eq!(bus.pan, 0.0);
    }

    #[test]
    fn create_audio_bus_with_options() {
        let bus = create_audio_bus(Some(&AudioBusOptions {
            gain: Some(0.7),
            muted: Some(true),
            name: Some("sfx".into()),
            pan: Some(0.3),
        }));
        assert_eq!(bus.gain, 0.7);
        assert!(bus.muted);
        assert_eq!(bus.name, "sfx");
        assert_eq!(bus.pan, 0.3);
    }

    #[test]
    fn create_audio_mixer_defaults() {
        let mixer = create_audio_mixer(None);
        assert_eq!(mixer.master_gain, 1.0);
        assert!(!mixer.master_muted);
    }

    #[test]
    fn create_audio_mixer_with_options() {
        let mixer = create_audio_mixer(Some(&AudioMixerOptions {
            master_gain: Some(0.5),
            master_muted: Some(true),
        }));
        assert_eq!(mixer.master_gain, 0.5);
        assert!(mixer.master_muted);
    }

    #[test]
    fn add_audio_bus_to_mixer_is_idempotent() {
        let mut mixer = create_audio_mixer(None);
        let bus = create_audio_bus(Some(&AudioBusOptions {
            name: Some("music".into()),
            ..Default::default()
        }));
        add_audio_bus_to_mixer(&mut mixer, bus.clone());
        add_audio_bus_to_mixer(&mut mixer, bus);
        assert_eq!(mixer.buses.len(), 1);
    }

    #[test]
    fn set_audio_bus_gain_updates_bus() {
        let mut bus = create_audio_bus(None);
        assert_eq!(set_audio_bus_gain(&mut bus, 0.5), 0.5);
        assert_eq!(bus.gain, 0.5);
    }

    #[test]
    fn set_audio_bus_muted_updates_bus() {
        let mut bus = create_audio_bus(None);
        assert_eq!(set_audio_bus_muted(&mut bus, true), true);
        assert!(bus.muted);
    }

    #[test]
    fn set_audio_bus_pan_clamps() {
        let mut bus = create_audio_bus(None);
        assert_eq!(set_audio_bus_pan(&mut bus, 0.5), 0.5);
        assert_eq!(set_audio_bus_pan(&mut bus, 2.0), 1.0);
        assert_eq!(set_audio_bus_pan(&mut bus, -2.0), -1.0);
    }

    #[test]
    fn set_audio_mixer_master_gain_updates() {
        let mut mixer = create_audio_mixer(None);
        assert_eq!(set_audio_mixer_master_gain(&mut mixer, 0.5), 0.5);
        assert_eq!(mixer.master_gain, 0.5);
    }

    #[test]
    fn set_audio_mixer_master_muted_updates() {
        let mut mixer = create_audio_mixer(None);
        assert_eq!(set_audio_mixer_master_muted(&mut mixer, true), true);
        assert!(mixer.master_muted);
    }

    #[test]
    fn fade_audio_bus_gain_updates_data() {
        let mut mixer = create_audio_mixer(None);
        let mut bus = create_audio_bus(Some(&AudioBusOptions {
            gain: Some(1.0),
            ..Default::default()
        }));
        add_audio_bus_to_mixer(&mut mixer, bus.clone());
        fade_audio_bus_gain(&mut mixer, &mut bus, 0.5, 500.0);
        assert_eq!(bus.gain, 0.5);
    }

    #[test]
    fn fade_audio_bus_gain_when_not_in_mixer() {
        let mut mixer = create_audio_mixer(None);
        let mut bus = create_audio_bus(Some(&AudioBusOptions {
            gain: Some(1.0),
            ..Default::default()
        }));
        fade_audio_bus_gain(&mut mixer, &mut bus, 0.3, 200.0);
        assert_eq!(bus.gain, 0.3);
    }

    #[test]
    fn get_audio_mixer_active_channels_empty() {
        let mixer = create_audio_mixer(None);
        assert!(get_audio_mixer_active_channels(&mixer).is_empty());
    }

    #[test]
    #[serial]
    fn route_and_get_active_channels() {
        let _b = install_test_backend();
        let mut mixer = create_audio_mixer(None);
        let bus = create_audio_bus(None);
        let channel = play_audio_resource(&buffered_resource(), None).unwrap();
        route_audio_channel_to_mixer_bus(&mut mixer, channel, &bus);
        assert_eq!(get_audio_mixer_active_channels(&mixer).len(), 1);
        reset_backend();
    }

    #[test]
    #[serial]
    fn unroute_removes_channel() {
        let _b = install_test_backend();
        let mut mixer = create_audio_mixer(None);
        let bus = create_audio_bus(None);
        let channel = play_audio_resource(&buffered_resource(), None).unwrap();
        let idx = route_audio_channel_to_mixer_bus(&mut mixer, channel, &bus);
        let _returned = unroute_audio_channel_from_mixer_bus(&mut mixer, idx);
        assert!(get_audio_mixer_active_channels(&mixer).is_empty());
        reset_backend();
    }

    #[test]
    #[serial]
    fn pause_all_pauses_playing_channels() {
        let _b = install_test_backend();
        let mut mixer = create_audio_mixer(None);
        let bus = create_audio_bus(None);
        let channel = play_audio_resource(&buffered_resource(), None).unwrap();
        route_audio_channel_to_mixer_bus(&mut mixer, channel, &bus);
        pause_all_audio_mixer_channels(&mut mixer);
        assert_eq!(mixer.channels[0].channel.state, AudioChannelState::Paused);
        reset_backend();
    }

    #[test]
    #[serial]
    fn resume_all_resumes_paused_channels() {
        let _b = install_test_backend();
        let mut mixer = create_audio_mixer(None);
        let bus = create_audio_bus(None);
        let channel = play_audio_resource(&buffered_resource(), None).unwrap();
        route_audio_channel_to_mixer_bus(&mut mixer, channel, &bus);
        pause_all_audio_mixer_channels(&mut mixer);
        resume_all_audio_mixer_channels(&mut mixer);
        assert_eq!(mixer.channels[0].channel.state, AudioChannelState::Playing);
        reset_backend();
    }

    #[test]
    #[serial]
    fn stop_all_stops_and_clears() {
        let _b = install_test_backend();
        let mut mixer = create_audio_mixer(None);
        let bus = create_audio_bus(None);
        let channel = play_audio_resource(&buffered_resource(), None).unwrap();
        route_audio_channel_to_mixer_bus(&mut mixer, channel, &bus);
        stop_all_audio_mixer_channels(&mut mixer);
        assert!(get_audio_mixer_active_channels(&mixer).is_empty());
        reset_backend();
    }

    #[test]
    #[serial]
    fn destroy_stops_channels_and_clears() {
        let _b = install_test_backend();
        let mut mixer = create_audio_mixer(None);
        let bus = create_audio_bus(None);
        let channel = play_audio_resource(&buffered_resource(), None).unwrap();
        route_audio_channel_to_mixer_bus(&mut mixer, channel, &bus);
        destroy_audio_mixer(&mut mixer);
        assert!(mixer.channels.is_empty());
        assert!(mixer.buses.is_empty());
        // Safe to call again.
        destroy_audio_mixer(&mut mixer);
        reset_backend();
    }
}
