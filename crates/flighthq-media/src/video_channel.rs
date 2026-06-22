//! Video playback channel — play, pause, resume, stop, and property setters.
//!
//! This is a faithful port of `packages/media/src/videoChannel.ts`. The TS
//! version drives a live `HTMLVideoElement` (its `currentTime`, `duration`,
//! `volume`, `playbackRate`, `play`/`pause`, and the `ended` event). Rust has
//! no video output backend yet, so the actual decode/output is routed through a
//! swappable [`VideoBackend`] seam (`set_video_backend`). The default backend
//! is a no-op stub with no real clock. The channel state machine
//! (play/pause/resume/stop/seek/gain/rate and the loop + complete logic) is
//! fully implemented and backend-independent.

use std::sync::Arc;
use std::sync::Mutex;
use std::sync::OnceLock;

use flighthq_signals::emit_signal;
use flighthq_types::VideoChannel;
use flighthq_types::VideoChannelState;
use flighthq_types::VideoPlayOptions;
use flighthq_types::VideoResource;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Returns the channel's current playback position in milliseconds. When the
/// channel is playing, this queries the video backend for the live position;
/// otherwise it returns the stored `channel.current_time`.
pub fn get_video_channel_current_time(channel: &VideoChannel) -> f64 {
    if channel.state != VideoChannelState::Playing {
        return channel.current_time;
    }
    video_backend().live_position_ms(channel).unwrap_or(channel.current_time)
}

/// Pauses a playing channel. Snapshots `current_time` and pauses the
/// underlying backend. No-op when not playing.
pub fn pause_video_channel(channel: &mut VideoChannel) {
    if channel.state != VideoChannelState::Playing {
        return;
    }
    channel.current_time = get_video_channel_current_time(channel);
    channel.state = VideoChannelState::Paused;
    video_backend().pause(channel);
}

/// Creates a [`VideoChannel`] for `source`, initialises it from `options`,
/// and starts playback immediately. Returns `None` if the source has no
/// backend handle.
pub fn play_video_resource(
    source: &VideoResource,
    options: Option<&VideoPlayOptions>,
) -> Option<VideoChannel> {
    if source.path.is_none() {
        return None;
    }

    let backend = video_backend();
    let mut channel = VideoChannel {
        current_time: options.and_then(|o| o.current_time).unwrap_or(0.0),
        gain: options.and_then(|o| o.gain).unwrap_or(1.0),
        length: backend.duration_ms(source),
        loops: options.and_then(|o| o.loops).unwrap_or(0),
        playback_rate: options.and_then(|o| o.playback_rate).unwrap_or(1.0),
        source: Some(source.clone()),
        state: VideoChannelState::Stopped,
        ..Default::default()
    };
    channel.loops_remaining = channel.loops;

    backend.prepare(&channel);
    start_video_channel(&mut channel);
    Some(channel)
}

/// Resumes a paused or stopped channel from `channel.current_time`. No-op
/// when already playing or when the source has no backend handle.
pub fn resume_video_channel(channel: &mut VideoChannel) {
    if channel.state == VideoChannelState::Playing
        || channel.source.as_ref().map(|s| s.path.is_none()).unwrap_or(true)
    {
        return;
    }
    start_video_channel(channel);
}

/// Seeks to `value` milliseconds (clamped to `[0, channel.length]`). Seeks the
/// backend to the new position. Returns the clamped position.
pub fn set_video_channel_current_time(channel: &mut VideoChannel, value: f64) -> f64 {
    channel.current_time = clamp(value, 0.0, channel.length);
    if channel.source.is_some() {
        video_backend().seek(channel, channel.current_time);
    }
    channel.current_time
}

/// Sets the channel gain (volume scale). Updates the live backend when active.
/// Returns the new value.
pub fn set_video_channel_gain(channel: &mut VideoChannel, value: f32) -> f32 {
    channel.gain = value;
    if channel.source.is_some() {
        video_backend().set_gain(channel, value);
    }
    channel.gain
}

/// Sets the playback rate multiplier. Updates the live backend when active.
/// Returns the new value.
pub fn set_video_channel_playback_rate(channel: &mut VideoChannel, value: f32) -> f32 {
    channel.playback_rate = value;
    if channel.source.is_some() {
        video_backend().set_playback_rate(channel, value);
    }
    channel.playback_rate
}

/// Stops the channel, resets `current_time` to 0, and sets state to
/// `Stopped`. Does not emit `on_complete`.
pub fn stop_video_channel(channel: &mut VideoChannel) {
    if channel.source.is_some() {
        video_backend().stop(channel);
    }
    channel.current_time = 0.0;
    channel.state = VideoChannelState::Stopped;
}

// ---------------------------------------------------------------------------
// Backend seam
// ---------------------------------------------------------------------------

/// Output/decode seam for video channels. A native or web host registers an
/// implementation via [`set_video_backend`]; the default is a no-op stub with
/// no real clock or video output.
///
/// Implementations own the mapping from a channel to its live element/handle
/// and must call [`complete_video_channel`] when playback reaches the end so
/// loop + `on_complete` logic runs.
pub trait VideoBackend: Send + Sync {
    /// Decoded duration of `source` in milliseconds, or `0.0` when unknown.
    fn duration_ms(&self, _source: &VideoResource) -> f64 {
        0.0
    }

    /// Live playback position in milliseconds for a playing channel, or `None`
    /// when the backend has no real clock (fall back to stored `current_time`).
    fn live_position_ms(&self, _channel: &VideoChannel) -> Option<f64> {
        None
    }

    /// Initialises the backend handle with the channel's options before the
    /// first play (seek, volume, rate, disable native loop, wire `ended`).
    fn prepare(&self, _channel: &VideoChannel) {}

    /// Seeks to `position_ms`, then begins playback.
    fn play(&self, _channel: &VideoChannel) {}

    /// Pauses playback, leaving position intact.
    fn pause(&self, _channel: &VideoChannel) {}

    /// Pauses playback and rewinds the backend handle to the start.
    fn stop(&self, _channel: &VideoChannel) {}

    /// Seeks the backend handle to `position_ms` without changing play state.
    fn seek(&self, _channel: &VideoChannel, _position_ms: f64) {}

    /// Applies a new gain (volume) to the backend handle.
    fn set_gain(&self, _channel: &VideoChannel, _gain: f32) {}

    /// Applies a new playback rate to the backend handle.
    fn set_playback_rate(&self, _channel: &VideoChannel, _rate: f32) {}
}

/// Replaces the global video backend. Pass a host implementation to enable
/// real decode/output. Defaults to a no-op stub.
pub fn set_video_backend(backend: Arc<dyn VideoBackend>) {
    *backend_slot().lock().unwrap() = backend;
}

/// Advances a playing channel past the end of playback.
///
/// If loops remain it rewinds to `0` and restarts; otherwise it transitions to
/// `Complete`, snaps `current_time` to `length`, and emits `on_complete`. A
/// backend calls this on the `ended` event. No-op when not playing.
pub fn complete_video_channel(channel: &mut VideoChannel) {
    if channel.state != VideoChannelState::Playing {
        return;
    }

    if channel.loops_remaining != 0 {
        if channel.loops_remaining > 0 {
            channel.loops_remaining -= 1;
        }
        channel.current_time = 0.0;
        start_video_channel(channel);
        return;
    }

    channel.current_time = channel.length;
    channel.state = VideoChannelState::Complete;
    emit_signal(&channel.on_complete, &());
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn backend_slot() -> &'static Mutex<Arc<dyn VideoBackend>> {
    static SLOT: OnceLock<Mutex<Arc<dyn VideoBackend>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(Arc::new(NoopVideoBackend)))
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.clamp(min, max)
}

fn start_video_channel(channel: &mut VideoChannel) {
    if channel.source.as_ref().map(|s| s.path.is_none()).unwrap_or(true) {
        return;
    }
    channel.state = VideoChannelState::Playing;
    video_backend().play(channel);
}

fn video_backend() -> Arc<dyn VideoBackend> {
    backend_slot().lock().unwrap().clone()
}

struct NoopVideoBackend;

impl VideoBackend for NoopVideoBackend {}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::connect_signal;
    use flighthq_signals::SignalConnectOptions;
    use serial_test::serial;
    use std::sync::atomic::AtomicUsize;
    use std::sync::atomic::Ordering;

    fn source() -> VideoResource {
        VideoResource { path: Some("clip.mp4".into()) }
    }

    fn opts(current_time: Option<f64>) -> VideoPlayOptions {
        VideoPlayOptions { current_time, ..Default::default() }
    }

    /// A backend reporting a fixed duration and a frozen clock, mirroring the
    /// TS mock video element (whose `currentTime` is set to the channel start
    /// position on play and does not advance).
    struct TestBackend {
        duration_ms: f64,
        started_position_ms: Mutex<f64>,
    }

    impl VideoBackend for TestBackend {
        fn duration_ms(&self, _source: &VideoResource) -> f64 {
            self.duration_ms
        }
        fn live_position_ms(&self, _channel: &VideoChannel) -> Option<f64> {
            Some(*self.started_position_ms.lock().unwrap())
        }
        fn play(&self, channel: &VideoChannel) {
            *self.started_position_ms.lock().unwrap() = channel.current_time;
        }
    }

    fn install_backend(duration_ms: f64) {
        set_video_backend(Arc::new(TestBackend { duration_ms, started_position_ms: Mutex::new(0.0) }));
    }

    fn reset_backend() {
        set_video_backend(Arc::new(NoopVideoBackend));
    }

    // Channel functions read a process-global backend, so backend-sensitive
    // assertions run under a single serialized test to avoid cross-test races.
    #[test]
    #[serial]
    fn video_channel_behavior_with_backend() {
        // get_video_channel_current_time: stored time when not playing.
        install_backend(10_000.0);
        let mut channel = play_video_resource(&source(), Some(&opts(Some(500.0)))).unwrap();
        pause_video_channel(&mut channel);
        assert_eq!(get_video_channel_current_time(&channel), 500.0);

        // pause_video_channel: marks paused.
        let mut channel = play_video_resource(&source(), None).unwrap();
        pause_video_channel(&mut channel);
        assert_eq!(channel.state, VideoChannelState::Paused);

        // play_video_resource: null when element/path is null.
        assert!(play_video_resource(&VideoResource::default(), None).is_none());

        // play_video_resource: playing channel with applied options.
        let channel = play_video_resource(
            &source(),
            Some(&VideoPlayOptions { gain: Some(0.5), ..Default::default() }),
        )
        .unwrap();
        assert_eq!(channel.gain, 0.5);
        assert_eq!(channel.state, VideoChannelState::Playing);

        // resume_video_channel: resumes a paused channel.
        let mut channel = play_video_resource(&source(), None).unwrap();
        pause_video_channel(&mut channel);
        resume_video_channel(&mut channel);
        assert_eq!(channel.state, VideoChannelState::Playing);

        // set_video_channel_current_time: clamps to length (duration 1s).
        install_backend(1000.0);
        let mut channel = play_video_resource(&source(), None).unwrap();
        assert_eq!(set_video_channel_current_time(&mut channel, 9999.0), 1000.0);

        // set_video_channel_gain.
        let mut channel = play_video_resource(&source(), None).unwrap();
        assert_eq!(set_video_channel_gain(&mut channel, 0.3), 0.3);
        assert_eq!(channel.gain, 0.3);

        // set_video_channel_playback_rate.
        let mut channel = play_video_resource(&source(), None).unwrap();
        assert_eq!(set_video_channel_playback_rate(&mut channel, 2.0), 2.0);
        assert_eq!(channel.playback_rate, 2.0);

        // stop_video_channel: resets and marks stopped.
        let mut channel = play_video_resource(&source(), Some(&opts(Some(400.0)))).unwrap();
        stop_video_channel(&mut channel);
        assert_eq!(channel.current_time, 0.0);
        assert_eq!(channel.state, VideoChannelState::Stopped);

        reset_backend();
    }

    #[test]
    #[serial]
    fn complete_video_channel_loops_then_completes() {
        install_backend(1000.0);
        let mut channel = play_video_resource(
            &source(),
            Some(&VideoPlayOptions { loops: Some(1), ..Default::default() }),
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

        complete_video_channel(&mut channel);
        assert_eq!(channel.state, VideoChannelState::Playing);
        assert_eq!(channel.loops_remaining, 0);
        assert_eq!(fired.load(Ordering::SeqCst), 0);

        complete_video_channel(&mut channel);
        assert_eq!(channel.state, VideoChannelState::Complete);
        assert_eq!(channel.current_time, channel.length);
        assert_eq!(fired.load(Ordering::SeqCst), 1);

        reset_backend();
    }
}
