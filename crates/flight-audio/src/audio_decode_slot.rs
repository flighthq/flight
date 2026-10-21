use crate::audio_format::get_audio_mime_type_essence;
use crate::types::{HostAudioDecodeCapabilities, HostAudioDecodeFormatCapability};

#[cfg(test)]
mod sugar_tests {
    use std::sync::Arc;

    use flight_hostcapability::ProviderRef;

    use super::*;

    fn capabilities() -> HostAudioDecodeCapabilities {
        return HostAudioDecodeCapabilities {
            ogg: Some(HostAudioDecodeFormatCapability {
                provider: Arc::new(()) as ProviderRef,
            }),
            ..HostAudioDecodeCapabilities::default()
        };
    }

    #[test]
    fn get_audio_decode_slot_method_matches_the_free_function() {
        let capabilities = capabilities();
        let method = capabilities.get_audio_decode_slot("audio/ogg").unwrap();
        let function = get_audio_decode_slot(&capabilities, "audio/ogg").unwrap();
        assert!(Arc::ptr_eq(&method.provider, &function.provider));
    }

    #[test]
    fn has_audio_decode_slot_method_matches_the_free_function() {
        let capabilities = capabilities();
        assert_eq!(
            capabilities.has_audio_decode_slot("audio/mpeg"),
            has_audio_decode_slot(&capabilities, "audio/mpeg")
        );
    }
}

pub fn get_audio_decode_slot<'a>(
    audio_decode: &'a HostAudioDecodeCapabilities,
    mime_type: &str,
) -> Option<&'a HostAudioDecodeFormatCapability> {
    return match get_audio_mime_type_essence(mime_type).as_str() {
        "audio/aac" | "audio/aacp" => audio_decode.aac.as_ref(),
        "audio/flac" | "audio/x-flac" => audio_decode.flac.as_ref(),
        "audio/mpeg" | "audio/mp3" | "audio/mpeg3" | "audio/x-mpeg" => audio_decode.mp3.as_ref(),
        "audio/mp4" | "audio/m4a" | "audio/x-m4a" => audio_decode.mp4.as_ref(),
        "audio/ogg" | "audio/vorbis" | "application/ogg" => audio_decode.ogg.as_ref(),
        "audio/wav" | "audio/wave" | "audio/x-wav" | "audio/vnd.wave" => audio_decode.wav.as_ref(),
        "audio/webm" => audio_decode.webm.as_ref(),
        _ => None,
    };
}

pub fn has_audio_decode_slot(audio_decode: &HostAudioDecodeCapabilities, mime_type: &str) -> bool {
    return get_audio_decode_slot(audio_decode, mime_type).is_some();
}

impl HostAudioDecodeCapabilities {
    pub fn get_audio_decode_slot(
        &self,
        mime_type: &str,
    ) -> Option<&HostAudioDecodeFormatCapability> {
        return get_audio_decode_slot(self, mime_type);
    }

    pub fn has_audio_decode_slot(&self, mime_type: &str) -> bool {
        return has_audio_decode_slot(self, mime_type);
    }
}
