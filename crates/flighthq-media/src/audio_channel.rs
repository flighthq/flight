//! Audio playback channel — play, pause, resume, stop, and property setters.
//!
//! This is a faithful port of `packages/media/src/audioChannel.ts`. The TS
//! version drives a live Web Audio `AudioContext` (source node, gain node, and
//! a real playback clock). Rust has no audio output backend yet, so the actual
//! decode/output is routed through a swappable [`AudioBackend`] seam
//! (`set_audio_backend`). The default backend is a no-op stub: it tracks no
//! real clock, so a playing channel reports its stored `current_time`. The
//! channel state machine (play/pause/resume/stop/seek/gain/rate and the loop +
//! complete logic) is fully implemented and backend-independent.

use std::sync::Arc;
use std::sync::Mutex;
use std::sync::OnceLock;

use flighthq_signals::emit_signal;
use flighthq_types::AudioChannel;
use flighthq_types::AudioChannelState;
use flighthq_types::AudioPlayOptions;
use flighthq_types::AudioResource;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Returns the channel's current playback position in milliseconds. When the
/// channel is playing, this queries the audio backend for the live position
/// (clamped to `[0, length]`); otherwise it returns the stored
/// `channel.current_time`.
pub fn get_audio_channel_current_time(channel: &AudioChannel) -> f64 {
    if channel.state != AudioChannelState::Playing {
        return channel.current_time;
    }
    match audio_backend().live_position_ms(channel) {
        Some(position) => position.min(channel.length).max(0.0),
        None => channel.current_time,
    }
}

/// Pauses a playing channel. Snapshots `current_time` and stops the active
/// output node. No-op when not playing.
pub fn pause_audio_channel(channel: &mut AudioChannel) {
    if channel.state != AudioChannelState::Playing {
        return;
    }
    channel.current_time = get_audio_channel_current_time(channel);
    channel.state = AudioChannelState::Paused;
    audio_backend().stop(channel);
}

/// Creates an [`AudioChannel`] for `source`, initialises it from `options`,
/// and starts playback immediately. Returns `None` if the source has no
/// decoded buffer.
pub fn play_audio_resource(
    source: &AudioResource,
    options: Option<&AudioPlayOptions>,
) -> Option<AudioChannel> {
    if source.buffer.is_none() {
        return None;
    }

    let backend = audio_backend();
    let length = backend.duration_ms(source);
    let mut channel = AudioChannel {
        current_time: options.and_then(|o| o.current_time).unwrap_or(0.0),
        gain: options.and_then(|o| o.gain).unwrap_or(1.0),
        length,
        loops: options.and_then(|o| o.loops).unwrap_or(0),
        playback_rate: options.and_then(|o| o.playback_rate).unwrap_or(1.0),
        source: Some(source.clone()),
        state: AudioChannelState::Stopped,
        ..Default::default()
    };
    channel.loops_remaining = channel.loops;

    start_audio_channel(&mut channel);
    Some(channel)
}

/// Resumes a paused or stopped channel from `channel.current_time`. No-op
/// when already playing or when the source has no buffer.
pub fn resume_audio_channel(channel: &mut AudioChannel) {
    if channel.state == AudioChannelState::Playing
        || channel.source.as_ref().map(|s| s.buffer.is_none()).unwrap_or(true)
    {
        return;
    }
    start_audio_channel(channel);
}

/// Seeks to `value` milliseconds (clamped to `[0, channel.length]`). If the
/// channel is playing, restarts the output node from the new position. Returns
/// the clamped position.
pub fn set_audio_channel_current_time(channel: &mut AudioChannel, value: f64) -> f64 {
    channel.current_time = clamp(value, 0.0, channel.length);
    if channel.state == AudioChannelState::Playing {
        audio_backend().stop(channel);
        start_audio_channel(channel);
    }
    channel.current_time
}

/// Sets the channel gain (volume scale). Updates the live output node when the
/// channel is playing. Returns the new value.
pub fn set_audio_channel_gain(channel: &mut AudioChannel, value: f32) -> f32 {
    channel.gain = value;
    if channel.state == AudioChannelState::Playing {
        audio_backend().set_gain(channel, value);
    }
    channel.gain
}

/// Sets the playback rate multiplier. Updates the live output node when the
/// channel is playing. Returns the new value.
pub fn set_audio_channel_playback_rate(channel: &mut AudioChannel, value: f32) -> f32 {
    channel.playback_rate = value;
    if channel.state == AudioChannelState::Playing {
        audio_backend().set_playback_rate(channel, value);
    }
    channel.playback_rate
}

/// Stops the channel, resets `current_time` to 0, and sets state to
/// `Stopped`. Does not emit `on_complete`.
pub fn stop_audio_channel(channel: &mut AudioChannel) {
    audio_backend().stop(channel);
    channel.current_time = 0.0;
    channel.state = AudioChannelState::Stopped;
}

// ---------------------------------------------------------------------------
// Backend seam
// ---------------------------------------------------------------------------

/// Output/decode seam for audio channels. A native or web host registers an
/// implementation via [`set_audio_backend`]; the default is a no-op stub with
/// no real clock or audio output.
///
/// Implementations own the mapping from a channel to its live output node and
/// must call [`complete_audio_channel`] when a started node reaches its end so
/// loop + `on_complete` logic runs.
pub trait AudioBackend: Send + Sync {
    /// Decoded duration of `source` in milliseconds, or `0.0` when unknown.
    fn duration_ms(&self, _source: &AudioResource) -> f64 {
        0.0
    }

    /// Live playback position in milliseconds for a playing channel, or `None`
    /// when the backend has no real clock (fall back to stored `current_time`).
    fn live_position_ms(&self, _channel: &AudioChannel) -> Option<f64> {
        None
    }

    /// Starts an output node for `channel` at `channel.current_time`.
    fn start(&self, _channel: &AudioChannel) {}

    /// Stops and releases the channel's active output node, if any.
    fn stop(&self, _channel: &AudioChannel) {}

    /// Applies a new gain to the channel's live output node.
    fn set_gain(&self, _channel: &AudioChannel, _gain: f32) {}

    /// Applies a new playback rate to the channel's live output node.
    fn set_playback_rate(&self, _channel: &AudioChannel, _rate: f32) {}
}

/// Replaces the global audio backend. Pass a host implementation to enable
/// real decode/output. Defaults to a no-op stub.
pub fn set_audio_backend(backend: Arc<dyn AudioBackend>) {
    *backend_slot().lock().unwrap() = backend;
}

/// Advances a playing channel past the end of its current output node.
///
/// If loops remain it rewinds to `0` and restarts; otherwise it transitions to
/// `Complete`, snaps `current_time` to `length`, and emits `on_complete`. A
/// backend calls this when a started node reaches its natural end. No-op when
/// the channel is not playing.
pub fn complete_audio_channel(channel: &mut AudioChannel) {
    if channel.state != AudioChannelState::Playing {
        return;
    }

    if channel.loops_remaining != 0 {
        if channel.loops_remaining > 0 {
            channel.loops_remaining -= 1;
        }
        channel.current_time = 0.0;
        start_audio_channel(channel);
        return;
    }

    channel.current_time = channel.length;
    channel.state = AudioChannelState::Complete;
    emit_signal(&channel.on_complete, &());
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn audio_backend() -> Arc<dyn AudioBackend> {
    backend_slot().lock().unwrap().clone()
}

fn backend_slot() -> &'static Mutex<Arc<dyn AudioBackend>> {
    static SLOT: OnceLock<Mutex<Arc<dyn AudioBackend>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(Arc::new(NoopAudioBackend)))
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.clamp(min, max)
}

fn start_audio_channel(channel: &mut AudioChannel) {
    if channel.source.as_ref().map(|s| s.buffer.is_none()).unwrap_or(true) {
        return;
    }
    channel.current_time = clamp(channel.current_time, 0.0, channel.length);
    channel.state = AudioChannelState::Playing;
    audio_backend().start(channel);
}

struct NoopAudioBackend;

impl AudioBackend for NoopAudioBackend {}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::connect_signal;
    use flighthq_signals::SignalConnectOptions;
    use flighthq_types::AudioResource;
    use serial_test::serial;
    use std::sync::atomic::AtomicBool;
    use std::sync::atomic::AtomicUsize;
    use std::sync::atomic::Ordering;

    fn buffered_resource() -> AudioResource {
        AudioResource { buffer: Some(vec![0u8; 8]) }
    }

    fn opts(current_time: Option<f64>) -> AudioPlayOptions {
        AudioPlayOptions { current_time, ..Default::default() }
    }

    /// A backend that reports a fixed 1000ms duration and a frozen clock,
    /// mirroring the TS mock AudioBuffer (`duration: 1`) and `AudioContext`
    /// whose `currentTime` stays at 0. With a frozen clock the live position
    /// equals the position the active node was last started at.
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

    fn reset_backend() {
        set_audio_backend(Arc::new(NoopAudioBackend));
    }

    // Channel functions read a process-global backend, so backend-sensitive
    // assertions run under a single serialized test to avoid cross-test races.
    #[test]
    #[serial]
    fn audio_channel_behavior_with_backend() {
        // get_audio_channel_current_time: stored time for an inactive channel.
        let _b = install_test_backend();
        let mut channel = play_audio_resource(&buffered_resource(), Some(&opts(Some(250.0)))).unwrap();
        pause_audio_channel(&mut channel);
        assert_eq!(get_audio_channel_current_time(&channel), 250.0);

        // pause_audio_channel: preserves position and marks paused.
        let mut channel = play_audio_resource(&buffered_resource(), Some(&opts(Some(100.0)))).unwrap();
        pause_audio_channel(&mut channel);
        assert_eq!(channel.current_time, 100.0);
        assert_eq!(channel.state, AudioChannelState::Paused);

        // play_audio_resource: null when buffer is null.
        assert!(play_audio_resource(&AudioResource::default(), None).is_none());

        // play_audio_resource: playing channel with applied options.
        let channel = play_audio_resource(
            &buffered_resource(),
            Some(&AudioPlayOptions { gain: Some(0.5), ..Default::default() }),
        )
        .unwrap();
        assert_eq!(channel.gain, 0.5);
        assert_eq!(channel.state, AudioChannelState::Playing);

        // resume_audio_channel: restarts from paused.
        let mut channel = play_audio_resource(&buffered_resource(), None).unwrap();
        pause_audio_channel(&mut channel);
        resume_audio_channel(&mut channel);
        assert_eq!(channel.state, AudioChannelState::Playing);

        // set_audio_channel_current_time: clamps to length.
        let mut channel = play_audio_resource(&buffered_resource(), None).unwrap();
        assert_eq!(set_audio_channel_current_time(&mut channel, 2000.0), 1000.0);

        // set_audio_channel_gain.
        let mut channel = play_audio_resource(&buffered_resource(), None).unwrap();
        assert_eq!(set_audio_channel_gain(&mut channel, 0.25), 0.25);
        assert_eq!(channel.gain, 0.25);

        // set_audio_channel_playback_rate.
        let mut channel = play_audio_resource(&buffered_resource(), None).unwrap();
        assert_eq!(set_audio_channel_playback_rate(&mut channel, 2.0), 2.0);
        assert_eq!(channel.playback_rate, 2.0);

        // stop_audio_channel: resets and marks stopped.
        let mut channel = play_audio_resource(&buffered_resource(), Some(&opts(Some(500.0)))).unwrap();
        stop_audio_channel(&mut channel);
        assert_eq!(channel.current_time, 0.0);
        assert_eq!(channel.state, AudioChannelState::Stopped);

        reset_backend();
    }

    #[test]
    #[serial]
    fn complete_audio_channel_loops_then_completes() {
        let _b = install_test_backend();
        let mut channel = play_audio_resource(
            &buffered_resource(),
            Some(&AudioPlayOptions { loops: Some(1), ..Default::default() }),
        )
        .unwrap();

        let fired = Arc::new(AtomicUsize::new(0));
        let fired_clone = fired.clone();
        let _guard = connect_signal(
            &channel.on_complete,
            Arc::new(move |_: &()| {
                fired_clone.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );

        // First completion consumes the single loop and restarts.
        complete_audio_channel(&mut channel);
        assert_eq!(channel.state, AudioChannelState::Playing);
        assert_eq!(channel.loops_remaining, 0);
        assert_eq!(fired.load(Ordering::SeqCst), 0);

        // Second completion has no loops left: completes and emits.
        complete_audio_channel(&mut channel);
        assert_eq!(channel.state, AudioChannelState::Complete);
        assert_eq!(channel.current_time, channel.length);
        assert_eq!(fired.load(Ordering::SeqCst), 1);

        reset_backend();
    }
}
