use std::sync::{Arc, RwLock};

use flight_buffer::{Blob, get_array_buffer_storage, read_blob_array_buffer};
use flight_entity::{
    FlightError, FlightErrorKind, Float32Array, Ref, Uint8Array, get_record_value,
};
use flight_net::{
    HostNetCapability, NetRequest, NetRequestOptions, NetResponseBody, NetResponseType, NetState,
    send_net_request,
};
use flight_stream::{AbortSignal, create_abort_controller, throw_if_aborted};

use crate::audio_buffer::{copy_to_audio_buffer_channel, create_audio_buffer};
use crate::audio_format::infer_audio_mime_type;
use crate::audio_resource::create_audio_resource;
use crate::audio_resource_source::select_audio_resource_source;
use crate::decode_audio_resource_bytes::decode_audio_resource_bytes;
use crate::types::{
    AudioDecoderRegistry, AudioResource, AudioResourceUrl, HostAudioCodecCapability,
    HostAudioDecodeCapabilities,
};

pub fn create_audio_resource_from_samples(
    channels: &[Ref<Box<Float32Array>>],
    sample_rate: f32,
) -> Ref<AudioResource> {
    let number_of_channels = channels.len();
    let length = channels
        .first()
        .map(|channel| channel.read().unwrap().len())
        .unwrap_or_default();
    if number_of_channels == 0 || length == 0 {
        return create_audio_resource(None);
    }
    let buffer = create_audio_buffer(length, number_of_channels, sample_rate);
    for (index, channel) in channels.iter().enumerate() {
        copy_to_audio_buffer_channel(&buffer, channel.read().unwrap().as_ref(), index);
    }
    return create_audio_resource(Some(buffer));
}

fn decode_base64(input: &str) -> Box<Uint8Array> {
    let mut sextets = Vec::with_capacity(input.len());
    let mut padding = 0_usize;
    let mut saw_padding = false;
    for byte in input.bytes() {
        if matches!(byte, b'\t' | b'\n' | b'\x0c' | b'\r' | b' ') {
            continue;
        }
        if byte == b'=' {
            saw_padding = true;
            padding += 1;
            if padding > 2 {
                invalid_base64();
            }
            continue;
        }
        if saw_padding {
            invalid_base64();
        }
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => invalid_base64(),
        };
        sextets.push(value);
    }
    let encoded_length = sextets.len() + padding;
    if encoded_length % 4 == 1 || padding > 0 && !encoded_length.is_multiple_of(4) {
        invalid_base64();
    }
    let mut out = Vec::with_capacity(sextets.len() * 3 / 4);
    let mut accumulator = 0_u32;
    let mut bits = 0_u32;
    for sextet in sextets {
        accumulator = (accumulator << 6) | u32::from(sextet);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((accumulator >> bits) & 0xff) as u8);
        }
    }
    if padding > 0 {
        let expected_remainder = if padding == 2 { 2 } else { 3 };
        if encoded_length.saturating_sub(padding) % 4 != expected_remainder {
            invalid_base64();
        }
    }
    return out.into_boxed_slice();
}

fn invalid_base64() -> ! {
    std::panic::panic_any(FlightError {
        kind: FlightErrorKind::Error,
        message: "Invalid base64 audio data".to_string(),
    });
}

pub async fn load_audio_resource_from_base64(
    audio_decode: &HostAudioDecodeCapabilities,
    base64: &str,
    mime_type: &str,
    signal: Option<&AbortSignal>,
    decoders: Option<&AudioDecoderRegistry>,
) -> Ref<AudioResource> {
    let bytes = Arc::new(RwLock::new(decode_base64(base64)));
    return load_audio_resource_from_bytes(audio_decode, &bytes, Some(mime_type), signal, decoders)
        .await;
}

pub async fn load_audio_resource_from_blob(
    audio_decode: &HostAudioDecodeCapabilities,
    blob: &Blob,
    signal: Option<&AbortSignal>,
    decoders: Option<&AudioDecoderRegistry>,
) -> Ref<AudioResource> {
    let default_controller = create_abort_controller();
    let signal = signal.unwrap_or(&default_controller.signal);
    throw_if_aborted(signal);
    let array_buffer = match read_blob_array_buffer(blob).await {
        Ok(array_buffer) => array_buffer,
        Err(cause) => std::panic::panic_any(cause),
    };
    throw_if_aborted(signal);
    let bytes = get_array_buffer_storage(&array_buffer);
    let mime_type = (!blob.mime_type.is_empty()).then_some(blob.mime_type.as_str());
    return load_audio_resource_from_bytes(audio_decode, &bytes, mime_type, Some(signal), decoders)
        .await;
}

pub async fn load_audio_resource_from_bytes(
    audio_decode: &HostAudioDecodeCapabilities,
    bytes: &Ref<Box<Uint8Array>>,
    mime_type: Option<&str>,
    signal: Option<&AbortSignal>,
    decoders: Option<&AudioDecoderRegistry>,
) -> Ref<AudioResource> {
    let default_controller = create_abort_controller();
    let signal = signal.unwrap_or(&default_controller.signal);
    let Some(resource) =
        decode_audio_resource_bytes(audio_decode, bytes, mime_type, signal, decoders).await
    else {
        let suffix = mime_type
            .map(|mime_type| format!(": {mime_type}"))
            .unwrap_or_default();
        std::panic::panic_any(FlightError {
            kind: FlightErrorKind::Error,
            message: format!("Failed to decode audio{suffix}"),
        });
    };
    return resource;
}

// flight-lint: allow(conform-params) D5 explicit NetState replaces the network module's hidden guard state and follows the source parameters
pub async fn load_audio_resource_from_url(
    host_net: &HostNetCapability,
    audio_decode: &HostAudioDecodeCapabilities,
    url: &str,
    signal: Option<&AbortSignal>,
    decoders: Option<&AudioDecoderRegistry>,
    net_state: &NetState,
) -> Ref<AudioResource> {
    let mime_type = infer_audio_mime_type(url);
    return load_audio_resource_from_url_with_mime_type(
        host_net,
        audio_decode,
        url,
        mime_type.as_deref(),
        signal,
        decoders,
        net_state,
    )
    .await;
}

async fn load_audio_resource_from_url_with_mime_type(
    host_net: &HostNetCapability,
    audio_decode: &HostAudioDecodeCapabilities,
    url: &str,
    mime_type: Option<&str>,
    signal: Option<&AbortSignal>,
    decoders: Option<&AudioDecoderRegistry>,
    net_state: &NetState,
) -> Ref<AudioResource> {
    let request = Arc::new(RwLock::new(NetRequest {
        method: "GET".to_string(),
        url: url.to_string(),
        headers: None,
        body: None,
        response_type: Some(NetResponseType::ArrayBuffer),
        timeout_ms: None,
        credentials: None,
        redirect: None,
    }));
    let options = signal.map(|signal| {
        Arc::new(RwLock::new(NetRequestOptions {
            progress: None,
            signal: Some(signal.clone()),
        }))
    });
    let response = match send_net_request(host_net, &request, options.as_ref(), net_state).await {
        Ok(response) => response,
        Err(error) => std::panic::panic_any(error),
    };
    let (body, content_type) = {
        let response = response.read().unwrap();
        if !response.ok {
            std::panic::panic_any(FlightError {
                kind: FlightErrorKind::Error,
                message: format!(
                    "Failed to load audio: {url} ({} {})",
                    response.status, response.status_text
                ),
            });
        }
        let Some(NetResponseBody::Buffer(body)) = response.body.as_ref() else {
            std::panic::panic_any(FlightError {
                kind: FlightErrorKind::Error,
                message: format!("Failed to load audio: {url} (invalid body)"),
            });
        };
        let content_type =
            get_record_value(&response.headers.read().unwrap(), "content-type").cloned();
        (body.clone(), content_type)
    };
    let bytes = get_array_buffer_storage(&body);
    return load_audio_resource_from_bytes(
        audio_decode,
        &bytes,
        content_type.as_deref().or(mime_type),
        signal,
        decoders,
    )
    .await;
}

// flight-lint: allow(conform-params) D5 explicit NetState replaces the network module's hidden guard state and follows the source parameters
pub async fn load_audio_resource_from_urls(
    host_net: &HostNetCapability,
    host_audio_codec: &HostAudioCodecCapability,
    audio_decode: &HostAudioDecodeCapabilities,
    sources: &[AudioResourceUrl],
    signal: Option<&AbortSignal>,
    decoders: Option<&AudioDecoderRegistry>,
    net_state: &NetState,
) -> Ref<AudioResource> {
    let selected = select_audio_resource_source(host_audio_codec, sources, |mime_type| {
        decoders.is_some_and(|decoders| decoders.contains_key(mime_type))
    });
    let Some(selected) = selected else {
        return create_audio_resource(None);
    };
    let mime_type = selected
        .type_
        .clone()
        .or_else(|| infer_audio_mime_type(&selected.url));
    return load_audio_resource_from_url_with_mime_type(
        host_net,
        audio_decode,
        &selected.url,
        mime_type.as_deref(),
        signal,
        decoders,
        net_state,
    )
    .await;
}

pub fn select_audio_resource_url(
    host_audio_codec: &HostAudioCodecCapability,
    sources: &[AudioResourceUrl],
    decoders: Option<&AudioDecoderRegistry>,
) -> Option<String> {
    return select_audio_resource_source(host_audio_codec, sources, |mime_type| {
        decoders.is_some_and(|decoders| decoders.contains_key(mime_type))
    })
    .map(|source| source.url.clone());
}
