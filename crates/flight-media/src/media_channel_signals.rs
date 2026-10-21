use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_signals::create_signal;

use crate::types::{AudioChannel, MediaChannelSignals, VideoChannel};

fn create_media_channel_signals() -> Ref<MediaChannelSignals> {
    return Arc::new(RwLock::new(MediaChannelSignals {
        on_buffering: create_signal(),
        on_complete: create_signal(),
        on_error: create_signal(),
        on_loop: create_signal(),
        on_pause: create_signal(),
        on_play: create_signal(),
        on_ready: create_signal(),
        on_seeked: create_signal(),
        on_stop: create_signal(),
    }));
}

/// Allocates and retains one signal group on first opt-in, returning the same identity thereafter.
pub fn enable_audio_channel_signals(channel: &Ref<AudioChannel>) -> Ref<MediaChannelSignals> {
    if let Some(signals) = channel.read().unwrap().signals.clone() {
        return signals;
    }
    let signals = create_media_channel_signals();
    let mut channel = channel.write().unwrap();
    if let Some(existing) = &channel.signals {
        return existing.clone();
    }
    channel.signals = Some(signals.clone());
    return signals;
}

/// Allocates and retains one signal group on first opt-in, returning the same identity thereafter.
pub fn enable_video_channel_signals(channel: &Ref<VideoChannel>) -> Ref<MediaChannelSignals> {
    if let Some(signals) = channel.read().unwrap().signals.clone() {
        return signals;
    }
    let signals = create_media_channel_signals();
    let mut channel = channel.write().unwrap();
    if let Some(existing) = &channel.signals {
        return existing.clone();
    }
    channel.signals = Some(signals.clone());
    return signals;
}

pub fn get_audio_channel_signals(channel: &Ref<AudioChannel>) -> Option<Ref<MediaChannelSignals>> {
    return channel.read().unwrap().signals.clone();
}

pub fn get_video_channel_signals(channel: &Ref<VideoChannel>) -> Option<Ref<MediaChannelSignals>> {
    return channel.read().unwrap().signals.clone();
}
