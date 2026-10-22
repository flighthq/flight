use crate::types::{AudioMimeTypeData, HostAudioCodecCapability};

// The contract file-structure rule requires modules before functions and impls.
#[allow(clippy::items_after_test_module)]
#[cfg(test)]
mod sugar_tests {
    use std::sync::Arc;

    use flight_host::ProviderRef;

    use super::*;

    #[test]
    fn host_audio_codec_capability_can_play_audio_type_matches_the_free_function() {
        let capability = HostAudioCodecCapability {
            can_play_type: Arc::new(|mime_type| mime_type == "audio/mpeg"),
            provider: Arc::new(()) as ProviderRef,
        };
        assert_eq!(
            capability.can_play_audio_type("audio/mpeg"),
            can_play_audio_type(&capability, "audio/mpeg")
        );
        assert_eq!(
            capability.can_play_audio_type(""),
            can_play_audio_type(&capability, "")
        );
    }
}

pub fn can_play_audio_type(host_audio_codec: &HostAudioCodecCapability, mime_type: &str) -> bool {
    if mime_type.is_empty() {
        return false;
    }
    return (host_audio_codec.can_play_type)(mime_type);
}

pub fn detect_audio_mime_type(data: AudioMimeTypeData<'_>) -> Option<String> {
    return data.with_bytes(detect_audio_mime_type_bytes);
}

fn detect_audio_mime_type_bytes(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 4 {
        return None;
    }
    if bytes.len() >= 12
        && bytes[0..4] == [0x52, 0x49, 0x46, 0x46]
        && bytes[8..12] == [0x57, 0x41, 0x56, 0x45]
    {
        return Some("audio/wav".to_string());
    }
    if bytes[0..4] == [0x66, 0x4c, 0x61, 0x43] {
        return Some("audio/flac".to_string());
    }
    if bytes[0..4] == [0x4f, 0x67, 0x67, 0x53] {
        return Some("audio/ogg".to_string());
    }
    if bytes[0..3] == [0x49, 0x44, 0x33] {
        return Some("audio/mpeg".to_string());
    }
    if bytes[0] == 0xff && bytes[1] & 0xe0 == 0xe0 && bytes[1] & 0x06 == 0x00 {
        return Some("audio/aac".to_string());
    }
    if bytes[0] == 0xff && bytes[1] & 0xe0 == 0xe0 {
        return Some("audio/mpeg".to_string());
    }
    if bytes.len() >= 8 && bytes[4..8] == [0x66, 0x74, 0x79, 0x70] {
        return Some("audio/mp4".to_string());
    }
    if bytes[0..4] == [0x1a, 0x45, 0xdf, 0xa3] {
        return Some("audio/webm".to_string());
    }
    return None;
}

pub fn get_audio_mime_type_essence(mime_type: &str) -> String {
    let essence = match mime_type.find(';') {
        Some(end) => &mime_type[..end],
        None => mime_type,
    };
    return essence.trim().to_lowercase();
}

pub fn get_audio_mime_type_parameter(mime_type: &str, name: &str) -> Option<String> {
    let wanted = name.to_lowercase();
    let mut start: Option<usize> = None;
    let mut quoted = false;
    for (index, character) in mime_type
        .char_indices()
        .chain(std::iter::once((mime_type.len(), ';')))
    {
        if character == '"' {
            quoted = !quoted;
        }
        if quoted || character != ';' {
            continue;
        }
        if let Some(part_start) = start {
            let part = &mime_type[part_start..index];
            if let Some(separator) = part.find('=')
                && part[..separator].trim().to_lowercase() == wanted
            {
                let value = part[separator + 1..].trim();
                if value.len() >= 2 && value.starts_with('"') && value.ends_with('"') {
                    return Some(value[1..value.len() - 1].to_string());
                }
                return Some(value.to_string());
            }
        }
        start = Some(index + 1);
    }
    return None;
}

pub fn infer_audio_mime_type(url: &str) -> Option<String> {
    let without_query = url.split('?').next().unwrap_or(url);
    let extension = without_query
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_lowercase();
    return match extension.as_str() {
        "mp3" => Some("audio/mpeg".to_string()),
        "ogg" => Some("audio/ogg".to_string()),
        "wav" => Some("audio/wav".to_string()),
        "aac" => Some("audio/aac".to_string()),
        "flac" => Some("audio/flac".to_string()),
        "webm" => Some("audio/webm".to_string()),
        "m4a" => Some("audio/mp4".to_string()),
        _ => None,
    };
}

impl HostAudioCodecCapability {
    pub fn can_play_audio_type(&self, mime_type: &str) -> bool {
        return can_play_audio_type(self, mime_type);
    }
}
