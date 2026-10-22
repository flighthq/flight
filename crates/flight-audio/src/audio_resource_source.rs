use crate::audio_format::{
    can_play_audio_type, get_audio_mime_type_essence, infer_audio_mime_type,
};
use crate::types::{AudioResourceUrl, HostAudioCodecCapability};

// The contract file-structure rule requires modules before functions and impls.
#[allow(clippy::items_after_test_module)]
#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::sync::Arc;

    use flight_host::ProviderRef;

    use super::*;

    fn host(can_play: impl Fn(&str) -> bool + Send + Sync + 'static) -> HostAudioCodecCapability {
        return HostAudioCodecCapability {
            can_play_type: Arc::new(can_play),
            provider: Arc::new(()) as ProviderRef,
        };
    }

    fn source(url: &str, type_: Option<&str>) -> AudioResourceUrl {
        return AudioResourceUrl {
            type_: type_.map(str::to_string),
            url: url.to_string(),
        };
    }

    #[test]
    fn accepts_a_caller_decoder_when_the_platform_cannot_play_the_type() {
        let decoders = HashSet::from(["audio/vnd.acme.custom".to_string()]);
        let sources = [source("sound.custom", Some("audio/vnd.acme.custom"))];
        let selected = select_audio_resource_source(&host(|_| false), &sources, |mime_type| {
            decoders.contains(mime_type)
        })
        .unwrap();
        assert_eq!(selected.url, "sound.custom");
    }

    #[test]
    fn explicit_type_precedes_the_url_extension() {
        let sources = [source("sound.mp3", Some("audio/ogg"))];
        let selected = select_audio_resource_source(
            &host(|mime_type| mime_type == "audio/ogg"),
            &sources,
            |_| false,
        )
        .unwrap();
        assert_eq!(selected.url, "sound.mp3");
    }

    #[test]
    fn keeps_source_order_when_several_are_playable() {
        let sources = [source("first.ogg", None), source("second.ogg", None)];
        let selected = select_audio_resource_source(
            &host(|mime_type| mime_type == "audio/ogg"),
            &sources,
            |_| false,
        )
        .unwrap();
        assert!(std::ptr::eq(selected, &sources[0]));
    }

    #[test]
    fn matches_decoder_keys_by_mime_essence() {
        let decoders = HashSet::from(["audio/vnd.acme.custom".to_string()]);
        let sources = [source(
            "sound.custom",
            Some("audio/vnd.acme.custom; rate=22050"),
        )];
        let selected = select_audio_resource_source(&host(|_| false), &sources, |mime_type| {
            decoders.contains(mime_type)
        })
        .unwrap();
        assert_eq!(selected.url, "sound.custom");
    }

    #[test]
    fn returns_none_when_no_source_has_a_decoder_or_playable_type() {
        let sources = [source("sound.mp3", None), source("sound.wav", None)];
        assert!(select_audio_resource_source(&host(|_| false), &sources, |_| false).is_none());
    }

    #[test]
    fn skips_an_untyped_source_before_a_playable_source() {
        let sources = [source("stream", None), source("sound.ogg", None)];
        let selected = select_audio_resource_source(
            &host(|mime_type| mime_type == "audio/ogg"),
            &sources,
            |_| false,
        )
        .unwrap();
        assert_eq!(selected.url, "sound.ogg");
    }
}

pub(crate) fn select_audio_resource_source<'a>(
    host_audio_codec: &HostAudioCodecCapability,
    sources: &'a [AudioResourceUrl],
    has_decoder: impl Fn(&str) -> bool,
) -> Option<&'a AudioResourceUrl> {
    for source in sources {
        let type_ = source
            .type_
            .clone()
            .or_else(|| infer_audio_mime_type(&source.url))
            .unwrap_or_default();
        let supplied = !type_.is_empty() && has_decoder(&get_audio_mime_type_essence(&type_));
        if supplied || can_play_audio_type(host_audio_codec, &type_) {
            return Some(source);
        }
    }
    return None;
}
