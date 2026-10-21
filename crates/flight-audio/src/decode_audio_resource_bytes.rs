use flight_entity::{Ref, Uint8Array};
use flight_stream::{AbortSignal, throw_if_aborted};

use crate::audio_decode_slot::get_audio_decode_slot;
use crate::audio_format::{detect_audio_mime_type, get_audio_mime_type_essence};
use crate::audio_resource::create_audio_resource;
use crate::types::{
    AudioDecoderRegistry, AudioMimeTypeData, AudioMimeTypeUint8Array, AudioResource,
    HostAudioDecodeCapabilities, HostAudioDecodeFormatCapability,
};

pub async fn decode_audio_resource_bytes(
    audio_decode: &HostAudioDecodeCapabilities,
    bytes: &Ref<Box<Uint8Array>>,
    mime_type: Option<&str>,
    signal: &AbortSignal,
    decoders: Option<&AudioDecoderRegistry>,
) -> Option<Ref<AudioResource>> {
    throw_if_aborted(signal);
    if let (Some(mime_type), Some(decoders)) = (mime_type, decoders)
        && let Some(decoder) = decoders.get(&get_audio_mime_type_essence(mime_type))
    {
        let resource = decoder(bytes.clone(), mime_type.to_string(), signal.clone()).await;
        throw_if_aborted(signal);
        return resource;
    }
    let slot = resolve_audio_decode_slot(audio_decode, bytes, mime_type)?;
    let buffer = (slot.decode)(bytes.clone(), signal.clone()).await;
    throw_if_aborted(signal);
    return buffer.map(|buffer| create_audio_resource(Some(buffer)));
}

fn resolve_audio_decode_slot<'a>(
    audio_decode: &'a HostAudioDecodeCapabilities,
    bytes: &Ref<Box<Uint8Array>>,
    mime_type: Option<&str>,
) -> Option<&'a HostAudioDecodeFormatCapability> {
    if let Some(mime_type) = mime_type
        && let Some(declared) = get_audio_decode_slot(audio_decode, mime_type)
    {
        return Some(declared);
    }
    let detected = {
        let bytes = bytes.read().unwrap();
        detect_audio_mime_type(AudioMimeTypeData::Uint8Array(AudioMimeTypeUint8Array {
            data: bytes.as_ref(),
        }))
    }?;
    return get_audio_decode_slot(audio_decode, &detected);
}
