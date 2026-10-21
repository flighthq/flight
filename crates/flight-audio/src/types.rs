use std::sync::Arc;

use flight_buffer::{ArrayBuffer, get_array_buffer_storage};
use flight_entity::Uint8Array;
use flight_hostcapability::ProviderRef;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn audio_channel_state_string_method_matches_the_free_function() {
        assert_eq!(
            AudioChannelState::Playing.to_audio_channel_state_string(),
            get_audio_channel_state_string(AudioChannelState::Playing)
        );
    }

    #[test]
    fn audio_resource_failure_kind_string_method_matches_the_free_function() {
        assert_eq!(
            AudioResourceFailureKind::Unavailable.to_audio_resource_failure_kind_string(),
            get_audio_resource_failure_kind_string(AudioResourceFailureKind::Unavailable)
        );
    }

    #[test]
    fn audio_resource_reference_kind_string_method_matches_the_free_function() {
        assert_eq!(
            AudioResourceReferenceKind::External.to_audio_resource_reference_kind_string(),
            get_audio_resource_reference_kind_string(AudioResourceReferenceKind::External)
        );
    }
}

/// Audio channel playback lifecycle (TS `AudioChannelState`). The owning channel lives in
/// `flight-media`; audio owns this shared closed vocabulary.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum AudioChannelState {
    Complete,
    Paused,
    Playing,
    #[default]
    Stopped,
}

/// Caller overrides accepted when media begins playing an `AudioResource`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct AudioPlayOptions {
    pub current_time: Option<f32>,
    pub gain: Option<f32>,
    pub loops: Option<i32>,
    pub playback_rate: Option<f32>,
}

/// One ordered candidate source for `loadAudioResourceFromUrls`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AudioResourceUrl {
    pub url: String,
    pub type_: Option<String>,
}

/// Stable category retained for a failed resource reference.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum AudioResourceFailureKind {
    #[default]
    Error,
    Unavailable,
}

/// Discriminant for an encoded resource reference.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum AudioResourceReferenceKind {
    #[default]
    Embedded,
    External,
}

/// The two exact byte containers accepted by `detectAudioMimeType` in the pinned source.
/// Both arms borrow canonical storage; detection never copies, detaches, or mutates it.
pub enum AudioMimeTypeData<'a> {
    ArrayBuffer(AudioMimeTypeArrayBuffer<'a>),
    Uint8Array(AudioMimeTypeUint8Array<'a>),
}

/// Named payload for the canonical shared `ArrayBuffer` arm.
pub struct AudioMimeTypeArrayBuffer<'a> {
    pub data: &'a ArrayBuffer,
}

/// Named payload for the typed-array arm.
pub struct AudioMimeTypeUint8Array<'a> {
    pub data: &'a Uint8Array,
}

/// Platform audio-container playability query (TS `HostAudioCodecCapability`). The provider token
/// is the canonical identity shared by every facet originating from the same host provider.
#[derive(Clone)]
pub struct HostAudioCodecCapability {
    pub can_play_type: Arc<dyn Fn(&str) -> bool + Send + Sync>,
    pub provider: ProviderRef,
}

// flight-lint: allow(conform-extra) D9e exact Rust string table for the TS AudioChannelState union; the TS package exports the union only
pub fn get_audio_channel_state_string(value: AudioChannelState) -> &'static str {
    return match value {
        AudioChannelState::Complete => "complete",
        AudioChannelState::Paused => "paused",
        AudioChannelState::Playing => "playing",
        AudioChannelState::Stopped => "stopped",
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust string table for the TS AudioResourceFailureKind const union; the TS package exports no conversion function
pub fn get_audio_resource_failure_kind_string(value: AudioResourceFailureKind) -> &'static str {
    return match value {
        AudioResourceFailureKind::Error => "Error",
        AudioResourceFailureKind::Unavailable => "Unavailable",
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust string table for the TS AudioResourceReferenceKind const union; the TS package exports no conversion function
pub fn get_audio_resource_reference_kind_string(value: AudioResourceReferenceKind) -> &'static str {
    return match value {
        AudioResourceReferenceKind::Embedded => "Embedded",
        AudioResourceReferenceKind::External => "External",
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust parser for the TS AudioChannelState union; the TS package exports the union only
pub fn parse_audio_channel_state(value: &str) -> Option<AudioChannelState> {
    return match value {
        "complete" => Some(AudioChannelState::Complete),
        "paused" => Some(AudioChannelState::Paused),
        "playing" => Some(AudioChannelState::Playing),
        "stopped" => Some(AudioChannelState::Stopped),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust parser for the TS AudioResourceFailureKind const union; the TS package exports no conversion function
pub fn parse_audio_resource_failure_kind(value: &str) -> Option<AudioResourceFailureKind> {
    return match value {
        "Error" => Some(AudioResourceFailureKind::Error),
        "Unavailable" => Some(AudioResourceFailureKind::Unavailable),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust parser for the TS AudioResourceReferenceKind const union; the TS package exports no conversion function
pub fn parse_audio_resource_reference_kind(value: &str) -> Option<AudioResourceReferenceKind> {
    return match value {
        "Embedded" => Some(AudioResourceReferenceKind::Embedded),
        "External" => Some(AudioResourceReferenceKind::External),
        _ => None,
    };
}

impl<'a> AudioMimeTypeData<'a> {
    pub(crate) fn with_bytes<T>(&self, read: impl FnOnce(&Uint8Array) -> T) -> T {
        return match self {
            AudioMimeTypeData::ArrayBuffer(buffer) => {
                let storage = get_array_buffer_storage(buffer.data);
                let storage = storage.read().unwrap();
                read(storage.as_ref())
            }
            AudioMimeTypeData::Uint8Array(bytes) => read(bytes.data),
        };
    }
}

impl AudioChannelState {
    pub fn to_audio_channel_state_string(self) -> &'static str {
        return get_audio_channel_state_string(self);
    }
}

impl AudioResourceFailureKind {
    pub fn to_audio_resource_failure_kind_string(self) -> &'static str {
        return get_audio_resource_failure_kind_string(self);
    }
}

impl AudioResourceReferenceKind {
    pub fn to_audio_resource_reference_kind_string(self) -> &'static str {
        return get_audio_resource_reference_kind_string(self);
    }
}
