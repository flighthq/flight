use std::sync::Arc;

use flight_buffer::{ArrayBuffer, get_array_buffer_storage};
use flight_entity::Uint8Array;
use flight_hostcapability::ProviderRef;

/// The two exact byte containers accepted by `detectAudioMimeType` in the pinned source.
/// Both arms borrow canonical storage; detection never copies, detaches, or mutates it.
pub enum AudioMimeTypeData<'a> {
    ArrayBuffer(&'a ArrayBuffer),
    Uint8Array(&'a Uint8Array),
}

/// Platform audio-container playability query (TS `HostAudioCodecCapability`). The provider token
/// is the canonical identity shared by every facet originating from the same host provider.
#[derive(Clone)]
pub struct HostAudioCodecCapability {
    pub can_play_type: Arc<dyn Fn(&str) -> bool + Send + Sync>,
    pub provider: ProviderRef,
}

impl<'a> AudioMimeTypeData<'a> {
    pub(crate) fn with_bytes<T>(&self, read: impl FnOnce(&Uint8Array) -> T) -> T {
        return match self {
            AudioMimeTypeData::ArrayBuffer(buffer) => {
                let storage = get_array_buffer_storage(buffer);
                let storage = storage.read().unwrap();
                read(storage.as_ref())
            }
            AudioMimeTypeData::Uint8Array(bytes) => read(bytes),
        };
    }
}

impl<'a> From<&'a ArrayBuffer> for AudioMimeTypeData<'a> {
    fn from(value: &'a ArrayBuffer) -> Self {
        return AudioMimeTypeData::ArrayBuffer(value);
    }
}

impl<'a> From<&'a Uint8Array> for AudioMimeTypeData<'a> {
    fn from(value: &'a Uint8Array) -> Self {
        return AudioMimeTypeData::Uint8Array(value);
    }
}
