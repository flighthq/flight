use std::collections::HashMap;
use std::sync::Arc;

use flight_audio::*;
use flight_hostcapability::ProviderRef;

fn empty_slots() -> HostAudioDecodeCapabilities {
    return HostAudioDecodeCapabilities {
        aac: None,
        flac: None,
        mp3: None,
        mp4: None,
        ogg: None,
        wav: None,
        webm: None,
    };
}

fn named_slots() -> (
    HostAudioDecodeCapabilities,
    HashMap<&'static str, ProviderRef>,
) {
    let provider = || Arc::new(()) as ProviderRef;
    let providers: HashMap<&'static str, ProviderRef> = [
        ("aac", provider()),
        ("flac", provider()),
        ("mp3", provider()),
        ("mp4", provider()),
        ("ogg", provider()),
        ("wav", provider()),
        ("webm", provider()),
    ]
    .into_iter()
    .collect();
    let slot = |name| HostAudioDecodeFormatCapability {
        decode: Arc::new(|_, _| Box::pin(async { None })),
        provider: providers[name].clone(),
    };
    return (
        HostAudioDecodeCapabilities {
            aac: Some(slot("aac")),
            flac: Some(slot("flac")),
            mp3: Some(slot("mp3")),
            mp4: Some(slot("mp4")),
            ogg: Some(slot("ogg")),
            wav: Some(slot("wav")),
            webm: Some(slot("webm")),
        },
        providers,
    );
}

mod get_audio_decode_slot {
    use super::*;

    fn assert_slot(
        capabilities: &HostAudioDecodeCapabilities,
        providers: &HashMap<&str, ProviderRef>,
        mime_type: &str,
        expected: &str,
    ) {
        let actual = get_audio_decode_slot(capabilities, mime_type).unwrap();
        assert!(Arc::ptr_eq(&actual.provider, &providers[expected]));
    }

    #[test]
    fn accepts_the_alternate_spellings_of_a_format() {
        let (capabilities, providers) = named_slots();
        assert_slot(&capabilities, &providers, "audio/mp3", "mp3");
        assert_slot(&capabilities, &providers, "audio/x-mpeg", "mp3");
        assert_slot(&capabilities, &providers, "audio/x-wav", "wav");
        assert_slot(&capabilities, &providers, "audio/vnd.wave", "wav");
        assert_slot(&capabilities, &providers, "audio/x-flac", "flac");
        assert_slot(&capabilities, &providers, "audio/x-m4a", "mp4");
        assert_slot(&capabilities, &providers, "application/ogg", "ogg");
    }

    #[test]
    fn ignores_mime_parameters_and_casing() {
        let (capabilities, providers) = named_slots();
        assert_slot(
            &capabilities,
            &providers,
            "audio/mp4; codecs=\"mp4a.40.2\"",
            "mp4",
        );
        assert_slot(&capabilities, &providers, "  AUDIO/OGG ; rate=48000", "ogg");
    }

    #[test]
    fn returns_the_sentinel_for_a_standard_type_whose_slot_the_host_left_empty() {
        assert!(get_audio_decode_slot(&empty_slots(), "audio/mpeg").is_none());
    }

    #[test]
    fn returns_the_sentinel_for_a_type_outside_the_standard_set() {
        let (capabilities, _) = named_slots();
        assert!(get_audio_decode_slot(&capabilities, "audio/vnd.adobe.swf-adpcm").is_none());
    }

    #[test]
    fn routes_each_standard_container_to_its_own_slot() {
        let (capabilities, providers) = named_slots();
        assert_slot(&capabilities, &providers, "audio/aac", "aac");
        assert_slot(&capabilities, &providers, "audio/flac", "flac");
        assert_slot(&capabilities, &providers, "audio/mpeg", "mp3");
        assert_slot(&capabilities, &providers, "audio/mp4", "mp4");
        assert_slot(&capabilities, &providers, "audio/ogg", "ogg");
        assert_slot(&capabilities, &providers, "audio/wav", "wav");
        assert_slot(&capabilities, &providers, "audio/webm", "webm");
    }
}

mod has_audio_decode_slot {
    use super::*;

    #[test]
    fn reports_whether_a_type_resolves_to_a_filled_slot() {
        let provider = Arc::new(()) as ProviderRef;
        let capabilities = HostAudioDecodeCapabilities {
            ogg: Some(HostAudioDecodeFormatCapability {
                decode: Arc::new(|_, _| Box::pin(async { None })),
                provider,
            }),
            ..empty_slots()
        };
        assert!(has_audio_decode_slot(&capabilities, "audio/ogg"));
        assert!(!has_audio_decode_slot(&capabilities, "audio/mpeg"));
        assert!(!has_audio_decode_slot(
            &capabilities,
            "audio/vnd.acme.custom"
        ));
    }
}
