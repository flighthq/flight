use std::sync::{Arc, RwLock};

use flight_audio::{AudioChannelState, AudioPlayOptions, AudioResource};
use flight_entity::Ref;
use flight_math::clamp;
use flight_signals::{create_signal, emit_signal};

use crate::media_channel_signals::get_audio_channel_signals;
use crate::types::*;

const INVALID_BUFFER: AudioBufferHandle = AudioBufferHandle(0);
const INVALID_SOURCE: AudioSourceHandle = AudioSourceHandle(0);

#[derive(Clone, Copy)]
enum AudioChannelSignalKind {
    Complete,
    Loop,
    Pause,
    Play,
    Stop,
}

/// Returns future passes to the whole buffer without changing the loop count.
pub fn clear_audio_channel_loop_region(channel: &Ref<AudioChannel>) {
    let mut channel = channel.write().unwrap();
    channel.loop_end = 0.0;
    channel.loop_start = 0.0;
}

fn complete_audio_channel(channel: &Ref<AudioChannel>) {
    let looped = {
        let mut channel = channel.write().unwrap();
        if channel.state != AudioChannelState::Playing {
            return;
        }
        let Some(runtime) = channel.channel_runtime.as_mut() else {
            return;
        };
        if runtime.loops_remaining != 0 {
            if runtime.loops_remaining > 0 {
                runtime.loops_remaining -= 1;
            }
            channel.current_time = 0.0;
            true
        } else {
            runtime.source_handle = INVALID_SOURCE;
            channel.current_time = channel.length;
            channel.state = AudioChannelState::Complete;
            false
        }
    };
    if looped {
        emit_audio_channel_signal(channel, AudioChannelSignalKind::Loop);
        start_audio_channel(channel);
    } else {
        emit_audio_channel_signal(channel, AudioChannelSignalKind::Complete);
        let on_complete = channel.read().unwrap().on_complete.clone();
        emit_signal(&on_complete, &());
    }
}

fn destroy_active_source(channel: &Ref<AudioChannel>) {
    let live = {
        let mut channel = channel.write().unwrap();
        let Some(runtime) = channel.channel_runtime.as_mut() else {
            return;
        };
        if runtime.source_handle == INVALID_SOURCE {
            return;
        }
        let live = (runtime.backend.clone(), runtime.source_handle);
        runtime.source_handle = INVALID_SOURCE;
        live
    };
    (live.0.on_source_ended)(live.1, None);
    (live.0.destroy_source)(live.1);
}

/// Releases the active source and the channel-owned host buffer. Repeated teardown is inert.
pub fn destroy_audio_channel(channel: &Ref<AudioChannel>) {
    destroy_active_source(channel);
    let buffer = {
        let mut channel = channel.write().unwrap();
        let Some(runtime) = channel.channel_runtime.take() else {
            return;
        };
        channel.state = AudioChannelState::Stopped;
        channel.current_time = 0.0;
        (runtime.backend, runtime.buffer_handle)
    };
    if buffer.1 != INVALID_BUFFER {
        (buffer.0.destroy_buffer)(buffer.1);
    }
}

fn emit_audio_channel_signal(channel: &Ref<AudioChannel>, kind: AudioChannelSignalKind) {
    let Some(signals) = get_audio_channel_signals(channel) else {
        return;
    };
    let signals = signals.read().unwrap();
    match kind {
        AudioChannelSignalKind::Complete => emit_signal(&signals.on_complete, &()),
        AudioChannelSignalKind::Loop => emit_signal(&signals.on_loop, &()),
        AudioChannelSignalKind::Pause => emit_signal(&signals.on_pause, &()),
        AudioChannelSignalKind::Play => emit_signal(&signals.on_play, &()),
        AudioChannelSignalKind::Stop => emit_signal(&signals.on_stop, &()),
    }
}

/// Schedules a host gain ramp when supported and otherwise lands the target immediately.
pub fn fade_audio_channel_gain(
    host_audio_device: &HostAudioDeviceCapability,
    channel: &Ref<AudioChannel>,
    target_gain: f32,
    duration_ms: f32,
) {
    let source = {
        let mut channel = channel.write().unwrap();
        channel.gain = target_gain;
        channel
            .channel_runtime
            .as_ref()
            .map(|runtime| runtime.source_handle)
    };
    let Some(source) = source else {
        return;
    };
    if source == INVALID_SOURCE {
        return;
    }
    if let Some(fade_source_gain) = &host_audio_device.fade_source_gain {
        fade_source_gain(source, target_gain, duration_ms);
    } else {
        (host_audio_device.set_source_gain)(source, target_gain);
    }
}

/// Returns the live host-clock position while playing and the stored position otherwise.
pub fn get_audio_channel_current_time(channel: &Ref<AudioChannel>) -> f32 {
    let (stored, length, state, runtime) = {
        let channel = channel.read().unwrap();
        (
            channel.current_time,
            channel.length,
            channel.state,
            channel
                .channel_runtime
                .as_ref()
                .map(|runtime| (runtime.backend.clone(), runtime.device, runtime.started_at)),
        )
    };
    if state != AudioChannelState::Playing {
        return stored;
    }
    let Some((backend, device, started_at)) = runtime else {
        return stored;
    };
    let elapsed_ms = ((backend.get_device_time)(device) - started_at) * 1000.0;
    return (elapsed_ms as f32).min(length);
}

pub fn get_audio_channel_duration(channel: &Ref<AudioChannel>) -> f32 {
    return channel.read().unwrap().length;
}

pub fn get_audio_channel_source_handle(channel: &Ref<AudioChannel>) -> AudioSourceHandle {
    return channel
        .read()
        .unwrap()
        .channel_runtime
        .as_ref()
        .map(|runtime| runtime.source_handle)
        .unwrap_or(INVALID_SOURCE);
}

pub fn has_audio_channel_fade(host_audio_device: &HostAudioDeviceCapability) -> bool {
    return host_audio_device.fade_source_gain.is_some();
}

pub fn is_audio_channel_muted(channel: &Ref<AudioChannel>) -> bool {
    return channel.read().unwrap().muted;
}

pub fn is_audio_channel_playing(channel: &Ref<AudioChannel>) -> bool {
    return channel.read().unwrap().state == AudioChannelState::Playing;
}

pub fn pause_audio_channel(channel: &Ref<AudioChannel>) {
    if !is_audio_channel_playing(channel) {
        return;
    }
    let current_time = get_audio_channel_current_time(channel);
    {
        let mut channel = channel.write().unwrap();
        channel.current_time = current_time;
        channel.state = AudioChannelState::Paused;
    }
    destroy_active_source(channel);
    emit_audio_channel_signal(channel, AudioChannelSignalKind::Pause);
}

/// Creates a host buffer and starts one channel, retaining the exact resource object as `source`.
// flight-lint: allow(f64) AudioBuffer duration is derived with the canonical double-precision seconds contract before storage in the f32 channel field
pub fn play_audio_resource(
    backend: &HostAudioDeviceCapability,
    device: AudioDeviceHandle,
    source: &Ref<AudioResource>,
    options: Option<&AudioPlayOptions>,
) -> Option<Ref<AudioChannel>> {
    let buffer = source.read().unwrap().buffer.clone()?;
    let (channels, length, sample_rate) = {
        let buffer = buffer.read().unwrap();
        (buffer.channels.to_vec(), buffer.length, buffer.sample_rate)
    };
    let buffer_handle =
        (backend.create_buffer)(device, channels.len(), length, sample_rate, &channels);
    let channel = Arc::new(RwLock::new(AudioChannel {
        current_time: options
            .and_then(|options| options.current_time)
            .unwrap_or(0.0),
        gain: options.and_then(|options| options.gain).unwrap_or(1.0),
        length: (length as f64 / f64::from(sample_rate) * 1000.0) as f32,
        loop_end: 0.0,
        loops: options.and_then(|options| options.loops).unwrap_or(0),
        loop_start: 0.0,
        muted: false,
        on_complete: create_signal(),
        pan: 0.0,
        playback_rate: options
            .and_then(|options| options.playback_rate)
            .unwrap_or(1.0),
        source: source.clone(),
        state: AudioChannelState::Stopped,
        channel_runtime: Some(AudioChannelRuntime {
            backend: backend.clone(),
            buffer_handle,
            device,
            loops_remaining: options.and_then(|options| options.loops).unwrap_or(0),
            source_handle: INVALID_SOURCE,
            source_route: None,
            started_at: 0.0,
        }),
        signals: None,
    }));
    start_audio_channel(&channel);
    emit_audio_channel_signal(&channel, AudioChannelSignalKind::Play);
    return Some(channel);
}

pub fn resume_audio_channel(channel: &Ref<AudioChannel>) {
    let (state, source) = {
        let channel = channel.read().unwrap();
        (channel.state, channel.source.clone())
    };
    if state == AudioChannelState::Playing || source.read().unwrap().buffer.is_none() {
        return;
    }
    start_audio_channel(channel);
    emit_audio_channel_signal(channel, AudioChannelSignalKind::Play);
}

pub fn set_audio_channel_current_time(channel: &Ref<AudioChannel>, value: f32) -> f32 {
    let (value, playing) = {
        let mut channel = channel.write().unwrap();
        channel.current_time = clamp(value, 0.0, channel.length);
        (
            channel.current_time,
            channel.state == AudioChannelState::Playing,
        )
    };
    if playing {
        destroy_active_source(channel);
        start_audio_channel(channel);
    }
    return value;
}

pub fn set_audio_channel_gain(channel: &Ref<AudioChannel>, value: f32) -> f32 {
    let live = {
        let mut channel = channel.write().unwrap();
        channel.gain = value;
        if channel.muted {
            None
        } else {
            channel.channel_runtime.as_ref().and_then(|runtime| {
                (runtime.source_handle != INVALID_SOURCE)
                    .then(|| (runtime.backend.clone(), runtime.source_handle))
            })
        }
    };
    if let Some((backend, source)) = live {
        (backend.set_source_gain)(source, value);
    }
    return value;
}

pub fn set_audio_channel_loop_region(
    channel: &Ref<AudioChannel>,
    start_ms: f32,
    end_ms: f32,
) -> bool {
    let mut channel = channel.write().unwrap();
    let start = clamp(start_ms, 0.0, channel.length);
    let end = clamp(end_ms, 0.0, channel.length);
    if end <= start {
        return false;
    }
    channel.loop_start = start;
    channel.loop_end = end;
    return true;
}

pub fn set_audio_channel_muted(channel: &Ref<AudioChannel>, value: bool) -> bool {
    let live = {
        let mut channel = channel.write().unwrap();
        channel.muted = value;
        channel.channel_runtime.as_ref().and_then(|runtime| {
            (runtime.source_handle != INVALID_SOURCE).then(|| {
                (
                    runtime.backend.clone(),
                    runtime.source_handle,
                    if value { 0.0 } else { channel.gain },
                )
            })
        })
    };
    if let Some((backend, source, gain)) = live {
        (backend.set_source_gain)(source, gain);
    }
    return value;
}

pub fn set_audio_channel_pan(channel: &Ref<AudioChannel>, value: f32) -> f32 {
    let (value, live) = {
        let mut channel = channel.write().unwrap();
        channel.pan = clamp(value, -1.0, 1.0);
        (
            channel.pan,
            channel.channel_runtime.as_ref().and_then(|runtime| {
                (runtime.source_handle != INVALID_SOURCE)
                    .then(|| (runtime.backend.clone(), runtime.source_handle))
            }),
        )
    };
    if let Some((backend, source)) = live {
        (backend.set_source_pan)(source, value);
    }
    return value;
}

pub fn set_audio_channel_playback_rate(channel: &Ref<AudioChannel>, value: f32) -> f32 {
    let live = {
        let mut channel = channel.write().unwrap();
        channel.playback_rate = value;
        channel.channel_runtime.as_ref().and_then(|runtime| {
            (runtime.source_handle != INVALID_SOURCE)
                .then(|| (runtime.backend.clone(), runtime.source_handle))
        })
    };
    if let Some((backend, source)) = live {
        (backend.set_source_playback_rate)(source, value);
    }
    return value;
}

/// Contract-only mixer seam. The route is retained while no source is live and applied immediately
/// when one exists.
pub fn set_audio_channel_source_route(
    channel: &Ref<AudioChannel>,
    route: Option<AudioSourceRoute>,
) {
    let source = {
        let mut channel = channel.write().unwrap();
        let Some(runtime) = channel.channel_runtime.as_mut() else {
            return;
        };
        runtime.source_route = route.clone();
        runtime.source_handle
    };
    if source != INVALID_SOURCE {
        if let Some(route) = route {
            route(source);
        }
    }
}

// flight-lint: allow(f64) host media time and playback offsets are JS-number seconds
fn start_audio_channel(channel: &Ref<AudioChannel>) {
    let (backend, device, buffer, gain, muted, pan, rate, current, loop_end, loop_start) = {
        let channel = channel.read().unwrap();
        let Some(runtime) = channel.channel_runtime.as_ref() else {
            return;
        };
        (
            runtime.backend.clone(),
            runtime.device,
            runtime.buffer_handle,
            channel.gain,
            channel.muted,
            channel.pan,
            channel.playback_rate,
            channel.current_time,
            channel.loop_end,
            channel.loop_start,
        )
    };
    let has_region = loop_end > loop_start;
    let region_floor = if has_region && current < loop_start {
        loop_start
    } else {
        current
    };
    let length = channel.read().unwrap().length;
    let current = clamp(
        region_floor,
        0.0,
        if has_region { loop_end } else { length },
    );
    let source = (backend.create_source)(device, buffer);
    (backend.set_source_gain)(source, if muted { 0.0 } else { gain });
    (backend.set_source_pan)(source, pan);
    let weak = Arc::downgrade(channel);
    let on_ended: AudioSourceEndedListener = Arc::new(move || {
        if let Some(channel) = weak.upgrade() {
            complete_audio_channel(&channel);
        }
    });
    (backend.on_source_ended)(source, Some(on_ended));
    let route = {
        let mut channel = channel.write().unwrap();
        let Some(runtime) = channel.channel_runtime.as_mut() else {
            return;
        };
        runtime.source_handle = source;
        runtime.started_at = (backend.get_device_time)(device) - f64::from(current) / 1000.0;
        let route = runtime.source_route.clone();
        channel.current_time = current;
        channel.state = AudioChannelState::Playing;
        route
    };
    if source != INVALID_SOURCE {
        if let Some(route) = route {
            route(source);
        }
    }
    let duration = if has_region {
        f64::from(loop_end - current) / 1000.0
    } else {
        0.0
    };
    (backend.start_source)(source, f64::from(current) / 1000.0, duration);
    (backend.set_source_playback_rate)(source, rate);
    (backend.resume_device)(device);
}

pub fn stop_audio_channel(channel: &Ref<AudioChannel>) {
    destroy_active_source(channel);
    {
        let mut channel = channel.write().unwrap();
        channel.current_time = 0.0;
        channel.state = AudioChannelState::Stopped;
    }
    emit_audio_channel_signal(channel, AudioChannelSignalKind::Stop);
}
