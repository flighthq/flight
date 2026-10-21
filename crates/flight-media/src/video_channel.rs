use std::sync::{Arc, RwLock};

use flight_bitmap::HostImageSource;
use flight_entity::Ref;
use flight_hostcapability::HostSpawnCapability;
use flight_math::clamp;
use flight_signals::{create_signal, emit_signal};
use flight_video::{HostVideoCapability, VideoChannelState, VideoPlayOptions, VideoResource};

use crate::media_channel_signals::get_video_channel_signals;
use crate::types::*;
use crate::video_channel_runtime::*;

#[derive(Clone, Copy)]
enum VideoChannelSignalKind {
    Complete,
    Loop,
    Pause,
    Play,
    Stop,
}

fn complete_video_channel(channel: &Ref<VideoChannel>) {
    let (looped, host) = {
        let mut channel = channel.write().unwrap();
        if channel.state != VideoChannelState::Playing {
            return;
        }
        let element = current_video_element(&channel);
        let Some(runtime) = channel.video_runtime.as_mut() else {
            return;
        };
        let host = (runtime.host_video.clone(), runtime.host_spawn.clone());
        let looped = if let Some(element) = element {
            let mut runtime_state = runtime.runtime_state.write().unwrap();
            prune_video_source_runtimes(&mut runtime_state);
            if let Some(index) = find_video_source_runtime(&runtime_state, &element) {
                let source_runtime = &mut runtime_state.source_runtimes[index];
                if source_runtime.loops_remaining != 0 {
                    if source_runtime.loops_remaining > 0 {
                        source_runtime.loops_remaining -= 1;
                    }
                    true
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        };
        if looped {
            channel.current_time = 0.0;
            (true, host)
        } else {
            channel.current_time = channel.length;
            channel.state = VideoChannelState::Complete;
            (false, host)
        }
    };
    if looped {
        emit_video_channel_signal(channel, VideoChannelSignalKind::Loop);
        start_video_channel(&host.0, &host.1, channel);
    } else {
        emit_video_channel_signal(channel, VideoChannelSignalKind::Complete);
        let on_complete = channel.read().unwrap().on_complete.clone();
        emit_signal(&on_complete, &());
    }
}

fn current_video_element(channel: &VideoChannel) -> Option<Arc<HostImageSource>> {
    return channel
        .source
        .as_ref()
        .and_then(|source| source.read().unwrap().element.clone());
}

/// Detaches the completion listener and pauses the element without destroying the independently
/// owned `VideoResource` or its media-stream tracks.
pub fn destroy_video_channel(host_video: &HostVideoCapability, channel: &Ref<VideoChannel>) {
    let (element, runtime_state) = {
        let channel = channel.read().unwrap();
        let element = current_video_element(&channel).or_else(|| channel.retained_element.clone());
        let runtime_state = channel
            .video_runtime
            .as_ref()
            .map(|runtime| runtime.runtime_state.clone());
        (element, runtime_state)
    };
    if let Some(element) = element {
        if let Some(runtime_state) = runtime_state {
            let listener = get_video_source_listener(&runtime_state, &element);
            if let (Some(remove), Some(listener)) = (&host_video.remove_ended_listener, listener) {
                remove(&element, &listener);
            }
            delete_video_source_runtime(&runtime_state, &element);
        }
        if let Some(pause) = &host_video.pause {
            pause(&element);
        }
    }
    let mut channel = channel.write().unwrap();
    channel.retained_element = None;
    channel.source = None;
    channel.state = VideoChannelState::Stopped;
    channel.current_time = 0.0;
    channel.video_runtime = None;
}

fn emit_video_channel_signal(channel: &Ref<VideoChannel>, kind: VideoChannelSignalKind) {
    let Some(signals) = get_video_channel_signals(channel) else {
        return;
    };
    let signals = signals.read().unwrap();
    match kind {
        VideoChannelSignalKind::Complete => emit_signal(&signals.on_complete, &()),
        VideoChannelSignalKind::Loop => emit_signal(&signals.on_loop, &()),
        VideoChannelSignalKind::Pause => emit_signal(&signals.on_pause, &()),
        VideoChannelSignalKind::Play => emit_signal(&signals.on_play, &()),
        VideoChannelSignalKind::Stop => emit_signal(&signals.on_stop, &()),
    }
}

pub fn get_video_channel_current_time(
    host_video: &HostVideoCapability,
    channel: &Ref<VideoChannel>,
) -> f32 {
    let (element, state, stored) = {
        let channel = channel.read().unwrap();
        (
            current_video_element(&channel),
            channel.state,
            channel.current_time,
        )
    };
    if state != VideoChannelState::Playing {
        return stored;
    }
    return match (element, &host_video.get_current_time) {
        (Some(element), Some(get_current_time)) => (get_current_time(&element) * 1000.0) as f32,
        _ => stored,
    };
}

pub fn get_video_channel_duration(channel: &Ref<VideoChannel>) -> f32 {
    return channel.read().unwrap().length;
}

pub fn get_video_channel_height(
    host_video: &HostVideoCapability,
    channel: &Ref<VideoChannel>,
) -> f32 {
    let element = current_video_element(&channel.read().unwrap());
    return match (element, &host_video.get_height) {
        (Some(element), Some(get_height)) => get_height(&element),
        _ => 0.0,
    };
}

pub fn get_video_channel_width(
    host_video: &HostVideoCapability,
    channel: &Ref<VideoChannel>,
) -> f32 {
    let element = current_video_element(&channel.read().unwrap());
    return match (element, &host_video.get_width) {
        (Some(element), Some(get_width)) => get_width(&element),
        _ => 0.0,
    };
}

pub fn is_video_channel_muted(channel: &Ref<VideoChannel>) -> bool {
    return channel.read().unwrap().muted;
}

pub fn is_video_channel_playing(channel: &Ref<VideoChannel>) -> bool {
    return channel.read().unwrap().state == VideoChannelState::Playing;
}

pub fn pause_video_channel(host_video: &HostVideoCapability, channel: &Ref<VideoChannel>) {
    if !is_video_channel_playing(channel) {
        return;
    }
    let current_time = get_video_channel_current_time(host_video, channel);
    let element = {
        let mut channel = channel.write().unwrap();
        let Some(element) = current_video_element(&channel) else {
            return;
        };
        channel.current_time = current_time;
        channel.state = VideoChannelState::Paused;
        element
    };
    if let Some(pause) = &host_video.pause {
        pause(&element);
    }
    emit_video_channel_signal(channel, VideoChannelSignalKind::Pause);
}

/// Starts a channel over the exact resource identity. The injected host executor drives the
/// provider Promise; a rejection stops a channel that is still playing and never panics.
// flight-lint: allow(f64) video duration is reported by the canonical host as JS-number seconds
// flight-lint: allow(conform-params) D5/D15: caller-owned source-identity runtime state and host spawning replace module WeakMaps and the fire-and-forget Promise
pub fn play_video_resource(
    host_video: &HostVideoCapability,
    host_spawn: &HostSpawnCapability,
    runtime_state: &VideoChannelRuntimeStateRef,
    source: &Ref<VideoResource>,
    options: Option<&VideoPlayOptions>,
) -> Option<Ref<VideoChannel>> {
    let element = source.read().unwrap().element.clone()?;
    if let Some(listener) = get_video_source_listener(runtime_state, &element) {
        if let Some(remove_ended_listener) = &host_video.remove_ended_listener {
            remove_ended_listener(&element, &listener);
        }
    }
    let length = host_video
        .get_duration
        .as_ref()
        .map(|get_duration| (get_duration(&element) * 1000.0) as f32)
        .unwrap_or(0.0);
    let channel = Arc::new(RwLock::new(VideoChannel {
        current_time: options
            .and_then(|options| options.current_time)
            .unwrap_or(0.0),
        gain: options.and_then(|options| options.gain).unwrap_or(1.0),
        length,
        loops: options.and_then(|options| options.loops).unwrap_or(0),
        muted: false,
        on_complete: create_signal(),
        playback_rate: options
            .and_then(|options| options.playback_rate)
            .unwrap_or(1.0),
        source: Some(source.clone()),
        state: VideoChannelState::Stopped,
        retained_element: Some(element.clone()),
        signals: None,
        video_runtime: None,
    }));
    let end_channel = channel.clone();
    let on_ended: flight_video::VideoEndedListener = Arc::new(move || {
        complete_video_channel(&end_channel);
    });
    {
        let mut channel = channel.write().unwrap();
        channel.video_runtime = Some(VideoChannelRuntime {
            host_video: host_video.clone(),
            host_spawn: host_spawn.clone(),
            runtime_state: runtime_state.clone(),
        });
    }
    set_video_source_runtime(
        runtime_state,
        &element,
        channel.read().unwrap().loops,
        on_ended.clone(),
    );
    let (current_time, gain, playback_rate) = {
        let channel = channel.read().unwrap();
        (channel.current_time, channel.gain, channel.playback_rate)
    };
    if let Some(set_current_time) = &host_video.set_current_time {
        set_current_time(&element, f64::from(current_time) / 1000.0);
    }
    if let Some(set_volume) = &host_video.set_volume {
        set_volume(&element, gain);
    }
    if let Some(set_playback_rate) = &host_video.set_playback_rate {
        set_playback_rate(&element, playback_rate);
    }
    if let Some(set_loop) = &host_video.set_loop {
        set_loop(&element, false);
    }
    if let Some(add_ended_listener) = &host_video.add_ended_listener {
        add_ended_listener(&element, on_ended);
    }
    start_video_channel(host_video, host_spawn, &channel);
    emit_video_channel_signal(&channel, VideoChannelSignalKind::Play);
    return Some(channel);
}

// flight-lint: allow(conform-params) D15: host-owned spawning drives the source's fire-and-forget play Promise without an SDK executor
pub fn resume_video_channel(
    host_video: &HostVideoCapability,
    host_spawn: &HostSpawnCapability,
    channel: &Ref<VideoChannel>,
) {
    let (state, element) = {
        let channel = channel.read().unwrap();
        (channel.state, current_video_element(&channel))
    };
    if state == VideoChannelState::Playing || element.is_none() {
        return;
    }
    start_video_channel(host_video, host_spawn, channel);
    emit_video_channel_signal(channel, VideoChannelSignalKind::Play);
}

// flight-lint: allow(f64) video seek positions cross the canonical host boundary in JS-number seconds
pub fn set_video_channel_current_time(
    host_video: &HostVideoCapability,
    channel: &Ref<VideoChannel>,
    value: f32,
) -> f32 {
    let (value, element) = {
        let mut channel = channel.write().unwrap();
        channel.current_time = clamp(value, 0.0, channel.length);
        (channel.current_time, current_video_element(&channel))
    };
    if let (Some(element), Some(set_current_time)) = (element, &host_video.set_current_time) {
        set_current_time(&element, f64::from(value) / 1000.0);
    }
    return value;
}

pub fn set_video_channel_gain(
    host_video: &HostVideoCapability,
    channel: &Ref<VideoChannel>,
    value: f32,
) -> f32 {
    let element = {
        let mut channel = channel.write().unwrap();
        channel.gain = value;
        current_video_element(&channel)
    };
    if let (Some(element), Some(set_volume)) = (element, &host_video.set_volume) {
        set_volume(&element, value);
    }
    return value;
}

pub fn set_video_channel_muted(
    host_video: &HostVideoCapability,
    channel: &Ref<VideoChannel>,
    value: bool,
) -> bool {
    let element = {
        let mut channel = channel.write().unwrap();
        channel.muted = value;
        current_video_element(&channel)
    };
    if let (Some(element), Some(set_muted)) = (element, &host_video.set_muted) {
        set_muted(&element, value);
    }
    return value;
}

pub fn set_video_channel_playback_rate(
    host_video: &HostVideoCapability,
    channel: &Ref<VideoChannel>,
    value: f32,
) -> f32 {
    let element = {
        let mut channel = channel.write().unwrap();
        channel.playback_rate = value;
        current_video_element(&channel)
    };
    if let (Some(element), Some(set_playback_rate)) = (element, &host_video.set_playback_rate) {
        set_playback_rate(&element, value);
    }
    return value;
}

// flight-lint: allow(f64) video seek positions cross the canonical host boundary in JS-number seconds
fn start_video_channel(
    host_video: &HostVideoCapability,
    host_spawn: &HostSpawnCapability,
    channel: &Ref<VideoChannel>,
) {
    let (element, current_time) = {
        let channel = channel.read().unwrap();
        let Some(element) = current_video_element(&channel) else {
            return;
        };
        (element, channel.current_time)
    };
    if let Some(set_current_time) = &host_video.set_current_time {
        set_current_time(&element, f64::from(current_time) / 1000.0);
    }
    channel.write().unwrap().state = VideoChannelState::Playing;
    let Some(play) = &host_video.play else {
        return;
    };
    let future = play(&element);
    let weak = Arc::downgrade(channel);
    (host_spawn.spawn)(Box::pin(async move {
        if future.await.is_err() {
            if let Some(channel) = weak.upgrade() {
                let mut channel = channel.write().unwrap();
                if channel.state == VideoChannelState::Playing {
                    channel.state = VideoChannelState::Stopped;
                }
            }
        }
    }));
}

pub fn stop_video_channel(host_video: &HostVideoCapability, channel: &Ref<VideoChannel>) {
    let (element, runtime_state) = {
        let channel = channel.read().unwrap();
        let element = current_video_element(&channel);
        let runtime_state = channel
            .video_runtime
            .as_ref()
            .map(|runtime| runtime.runtime_state.clone());
        (element, runtime_state)
    };
    if let Some(element) = element {
        if let Some(runtime_state) = runtime_state {
            let listener = get_video_source_listener(&runtime_state, &element);
            if let (Some(remove), Some(listener)) = (&host_video.remove_ended_listener, listener) {
                remove(&element, &listener);
            }
        }
        if let Some(pause) = &host_video.pause {
            pause(&element);
        }
        if let Some(set_current_time) = &host_video.set_current_time {
            set_current_time(&element, 0.0);
        }
    }
    {
        let mut channel = channel.write().unwrap();
        channel.current_time = 0.0;
        channel.state = VideoChannelState::Stopped;
    }
    emit_video_channel_signal(channel, VideoChannelSignalKind::Stop);
}
