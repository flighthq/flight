//! End-to-end decode through the `flight-audio` resource path: MIME declaration or sniffing picks
//! the host's slot, and the decoded buffer lands in an `AudioResource`.

use flight_audio::contract::decode_audio_resource_bytes;
use flight_audio::{AudioResourceUrl, select_audio_resource_url};
use flight_host_audio_codecs::*;
use flight_stream::create_abort_controller;

use crate::support::*;

fn decode_resource(
    host: &AudioCodecsHost,
    bytes: &[u8],
    mime_type: Option<&str>,
) -> Option<(usize, f32, usize, Vec<f32>)> {
    let signal = create_abort_controller().signal;
    let resource = block_on(decode_audio_resource_bytes(
        get_audio_codecs_host_decode_capabilities(host),
        &create_byte_handle(bytes),
        mime_type,
        &signal,
        None,
    ))?;
    let buffer = resource.read().unwrap().buffer.clone()?;
    let (channels, sample_rate, length) = read_layout(&buffer);
    return Some((channels, sample_rate, length, read_channel(&buffer, 0)));
}

mod decode_audio_resource_bytes_scenario {
    use super::*;

    #[test]
    fn wav_resources_decode_by_declared_or_sniffed_type() {
        let host = create_default_host();
        let bytes = encode_wav(
            1,
            2,
            44_100,
            16,
            &interleave_i16(&[-16_384, 8_192, 16_384, 0]),
            None,
        );
        for mime_type in [Some("audio/wav"), Some("audio/x-wav"), None] {
            let decoded = decode_resource(&host, &bytes, mime_type);
            if cfg!(feature = "wav") {
                assert_eq!(
                    decoded,
                    Some((2, 44_100.0, 2, vec![-0.5, 0.5])),
                    "{mime_type:?}"
                );
            } else {
                assert!(decoded.is_none());
            }
        }
    }

    #[test]
    fn ogg_vorbis_resources_decode_by_declared_or_sniffed_type() {
        let host = create_default_host();
        let mut shape = create_vorbis_stream_shape(vec![
            VorbisChannelContent::Tone { bin: 6, level: 230 },
            VorbisChannelContent::Silent,
        ]);
        shape.final_granule = Some(900);
        let bytes = encode_ogg_vorbis(&shape);
        for mime_type in [
            Some("audio/ogg; codecs=vorbis"),
            Some("application/ogg"),
            None,
        ] {
            let decoded = decode_resource(&host, &bytes, mime_type);
            if cfg!(feature = "ogg") {
                let (channels, sample_rate, length, left) = decoded.unwrap();
                assert_eq!((channels, sample_rate, length), (2, 22_050.0, 900));
                assert!(left.iter().any(|value| value.abs() > 0.05));
            } else {
                assert!(decoded.is_none());
            }
        }
    }

    #[test]
    fn malformed_bytes_resolve_to_no_resource() {
        let host = create_default_host();
        assert!(decode_resource(&host, b"RIFF\0\0\0\0WAVEjunk", None).is_none());
        assert!(decode_resource(&host, b"OggS garbage page", None).is_none());
    }

    #[test]
    fn source_selection_prefers_types_the_host_can_play() {
        let host = create_default_host();
        let sources = [
            AudioResourceUrl {
                url: "sound.mp3".to_string(),
                type_: Some("audio/mpeg".to_string()),
            },
            AudioResourceUrl {
                url: "sound.ogg".to_string(),
                type_: Some("audio/ogg; codecs=vorbis".to_string()),
            },
            AudioResourceUrl {
                url: "sound.wav".to_string(),
                type_: Some("audio/wav".to_string()),
            },
        ];
        let selected = select_audio_resource_url(
            get_audio_codecs_host_codec_capability(&host),
            &sources,
            None,
        );
        let expected = if cfg!(feature = "ogg") {
            Some("sound.ogg")
        } else if cfg!(feature = "wav") {
            Some("sound.wav")
        } else {
            None
        };
        assert_eq!(selected.as_deref(), expected);
    }
}
