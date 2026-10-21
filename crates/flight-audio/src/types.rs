use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_buffer::{ArrayBuffer, get_array_buffer_storage};
use flight_entity::{EntityRuntimeSlot, Ref, Uint8Array};
use flight_hostcapability::ProviderRef;
use flight_resource::ResourceResolutionState;
use flight_stream::AbortSignal;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn audio_channel_state_parse_method_matches_the_free_function() {
        assert_eq!(
            AudioChannelState::parse("playing"),
            parse_audio_channel_state("playing")
        );
    }

    #[test]
    fn audio_channel_state_to_str_method_matches_the_free_function() {
        assert_eq!(
            AudioChannelState::Playing.to_str(),
            get_audio_channel_state_string(AudioChannelState::Playing)
        );
    }

    #[test]
    fn audio_resource_failure_kind_parse_method_matches_the_free_function() {
        assert_eq!(
            AudioResourceFailureKind::parse("Unavailable"),
            parse_audio_resource_failure_kind("Unavailable")
        );
    }

    #[test]
    fn audio_resource_failure_kind_to_str_method_matches_the_free_function() {
        assert_eq!(
            AudioResourceFailureKind::Unavailable.to_str(),
            get_audio_resource_failure_kind_string(AudioResourceFailureKind::Unavailable)
        );
    }

    #[test]
    fn audio_resource_reference_kind_parse_method_matches_the_free_function() {
        assert_eq!(
            AudioResourceReferenceKind::parse("External"),
            parse_audio_resource_reference_kind("External")
        );
    }

    #[test]
    fn audio_resource_reference_kind_to_str_method_matches_the_free_function() {
        assert_eq!(
            AudioResourceReferenceKind::External.to_str(),
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

/// Web Audio `AudioBuffer` as a plain shared record. Every channel owns one fixed Float32Array
/// allocation behind a shared mutable handle, so channel-data reads preserve JavaScript identity.
#[derive(Clone)]
pub struct AudioBuffer {
    pub sample_rate: f32,
    pub length: usize,
    pub channels: Box<[Ref<Box<[f32]>>]>,
}

/// Decoded PCM resource. Clones allocate a new entity identity while sharing the same AudioBuffer
/// handle, exactly like the source resource wrapper.
#[derive(Default)]
pub struct AudioResource {
    pub buffer: Option<Ref<AudioBuffer>>,
    runtime: EntityRuntimeSlot,
}

/// One serialization-safe failure retained by an audio reference.
#[derive(Clone, Default)]
pub struct AudioResourceFailure {
    pub kind: AudioResourceFailureKind,
    pub message: String,
    pub name: Option<String>,
    runtime: EntityRuntimeSlot,
}

/// Parser-retained bytes and the stable resource identity they will fill after decoding. The
/// encoded bytes remain the exact shared typed-array allocation supplied by the caller.
pub struct EmbeddedAudioResourceReference {
    pub bytes: Ref<Box<Uint8Array>>,
    pub failure: Option<Ref<AudioResourceFailure>>,
    pub mime_type: Option<String>,
    pub name: Option<String>,
    pub resource: Ref<AudioResource>,
    pub state: ResourceResolutionState,
    runtime: EntityRuntimeSlot,
}

/// URI-backed audio reference resolved through the caller-owned fetch seam.
pub struct ExternalAudioResourceReference {
    pub uri: String,
    pub base_path: Option<String>,
    pub failure: Option<Ref<AudioResourceFailure>>,
    pub mime_type: Option<String>,
    pub name: Option<String>,
    pub resource: Ref<AudioResource>,
    pub state: ResourceResolutionState,
    runtime: EntityRuntimeSlot,
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

/// Named payload retaining one embedded reference entity handle in the untagged source union.
#[derive(Clone)]
pub struct EmbeddedAudioResourceReferenceValue {
    pub reference: Ref<EmbeddedAudioResourceReference>,
}

/// Named payload retaining one external reference entity handle in the untagged source union.
#[derive(Clone)]
pub struct ExternalAudioResourceReferenceValue {
    pub reference: Ref<ExternalAudioResourceReference>,
}

/// The source's two-member reference union. No synthetic serialized discriminant is introduced;
/// the existing `kind` contract is provided by the variant and exact entity type.
#[derive(Clone)]
pub enum AudioResourceReference {
    Embedded(EmbeddedAudioResourceReferenceValue),
    External(ExternalAudioResourceReferenceValue),
}

/// Detached diagnostic view of reference resolution.
#[derive(Clone)]
pub struct AudioResourceReferenceResolutionExplanation {
    pub failure: Option<Ref<AudioResourceFailure>>,
    pub kind: AudioResourceReferenceKind,
    pub retryable: bool,
    pub state: ResourceResolutionState,
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

/// One standard container-decode facet. Its canonical provider identity is already settled; the
/// pending PCM representation ruling supplies the decode callback's exact output type.
#[derive(Clone)]
pub struct HostAudioDecodeFormatCapability {
    pub provider: ProviderRef,
    pub decode: Arc<dyn Fn(Ref<Box<Uint8Array>>, AbortSignal) -> AudioBufferFuture + Send + Sync>,
}

/// Executor-neutral result of one host container decode. `None` is the source's expected miss.
pub type AudioBufferFuture = Pin<Box<dyn Future<Output = Option<Ref<AudioBuffer>>> + Send>>;

/// Executor-neutral result of a caller decoder or external fetch. `None` is an expected miss.
pub type AudioResourceFuture = Pin<Box<dyn Future<Output = Option<Ref<AudioResource>>> + Send>>;

/// Caller-owned decoder for non-platform formats. The encoded byte handle and AbortSignal are
/// passed by shared identity; the full parameterized MIME string is retained.
pub type AudioDecoder =
    Arc<dyn Fn(Ref<Box<Uint8Array>>, String, AbortSignal) -> AudioResourceFuture + Send + Sync>;

/// Lookup-only caller registry keyed by MIME essence; it is never iterated.
pub type AudioDecoderRegistry = HashMap<String, AudioDecoder>;

/// Caller-owned fetch seam for an external reference.
pub type AudioResourceFetch = Arc<
    dyn Fn(Ref<ExternalAudioResourceReference>, AbortSignal) -> AudioResourceFuture + Send + Sync,
>;

/// The seven closed standard container slots from the pinned host contract. A missing member is
/// capability absence, distinct from a filled decoder reporting an expected miss.
#[derive(Clone, Default)]
pub struct HostAudioDecodeCapabilities {
    pub aac: Option<HostAudioDecodeFormatCapability>,
    pub flac: Option<HostAudioDecodeFormatCapability>,
    pub mp3: Option<HostAudioDecodeFormatCapability>,
    pub mp4: Option<HostAudioDecodeFormatCapability>,
    pub ogg: Option<HostAudioDecodeFormatCapability>,
    pub wav: Option<HostAudioDecodeFormatCapability>,
    pub webm: Option<HostAudioDecodeFormatCapability>,
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

flight_entity::impl_entity!(AudioResource);
flight_entity::impl_entity!(AudioResourceFailure);
flight_entity::impl_entity!(EmbeddedAudioResourceReference);
flight_entity::impl_entity!(ExternalAudioResourceReference);

impl Default for EmbeddedAudioResourceReference {
    fn default() -> Self {
        return Self {
            bytes: Arc::new(std::sync::RwLock::new(Vec::new().into_boxed_slice())),
            failure: None,
            mime_type: None,
            name: None,
            resource: Arc::new(std::sync::RwLock::new(AudioResource::default())),
            state: ResourceResolutionState::Unresolved,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for ExternalAudioResourceReference {
    fn default() -> Self {
        return Self {
            uri: String::new(),
            base_path: None,
            failure: None,
            mime_type: None,
            name: None,
            resource: Arc::new(std::sync::RwLock::new(AudioResource::default())),
            state: ResourceResolutionState::Unresolved,
            runtime: EntityRuntimeSlot::default(),
        };
    }
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
    pub fn parse(value: &str) -> Option<Self> {
        return parse_audio_channel_state(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_audio_channel_state_string(self);
    }
}

impl AudioResourceFailureKind {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_audio_resource_failure_kind(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_audio_resource_failure_kind_string(self);
    }
}

impl AudioResourceReferenceKind {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_audio_resource_reference_kind(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_audio_resource_reference_kind_string(self);
    }
}
