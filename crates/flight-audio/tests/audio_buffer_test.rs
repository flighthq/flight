use std::sync::Arc;

use flight_audio::*;
use flight_entity::{FlightError, FlightErrorKind};

fn expect_not_supported(run: impl FnOnce() + std::panic::UnwindSafe, message: &str) {
    let error = std::panic::catch_unwind(run).unwrap_err();
    let error = error.downcast_ref::<FlightError>().unwrap();
    assert_eq!(error.kind, FlightErrorKind::NotSupportedError);
    assert_eq!(error.message, message);
}

mod copy_to_audio_buffer_channel {
    use super::*;

    #[test]
    fn copies_only_the_available_source_prefix_and_preserves_channel_identity() {
        let buffer = create_audio_buffer(3, 2, 48_000.0);
        let channel = buffer.read().unwrap().channels[1].clone();
        copy_to_audio_buffer_channel(&buffer, &[0.25, -0.5], 1);
        assert_eq!(&**channel.read().unwrap(), &[0.25, -0.5, 0.0]);
        assert!(Arc::ptr_eq(&channel, &buffer.read().unwrap().channels[1]));

        copy_to_audio_buffer_channel(&buffer, &[1.0, 2.0, 3.0, 4.0], 1);
        assert_eq!(&**channel.read().unwrap(), &[1.0, 2.0, 3.0]);
    }
}

mod create_audio_buffer {
    use super::*;

    #[test]
    fn allocates_distinct_zero_filled_channels_with_derived_fields() {
        let buffer = create_audio_buffer(3, 2, 48_000.0);
        let buffer = buffer.read().unwrap();
        assert_eq!(buffer.sample_rate, 48_000.0);
        assert_eq!(buffer.length, 3);
        assert_eq!(buffer.channels.len(), 2);
        assert_eq!(&**buffer.channels[0].read().unwrap(), &[0.0, 0.0, 0.0]);
        assert!(!Arc::ptr_eq(&buffer.channels[0], &buffer.channels[1]));
    }

    #[test]
    fn validates_the_portable_web_audio_constructor_ranges() {
        let channel_message = "AudioBuffer: numberOfChannels must be between 1 and 32";
        expect_not_supported(
            || {
                create_audio_buffer(1, 0, 48_000.0);
            },
            channel_message,
        );
        expect_not_supported(
            || {
                create_audio_buffer(1, 33, 48_000.0);
            },
            channel_message,
        );
        expect_not_supported(
            || {
                create_audio_buffer(0, 1, 48_000.0);
            },
            "AudioBuffer: length must be at least 1",
        );
        let sample_rate_message = "AudioBuffer: sampleRate must be between 3000 and 768000";
        expect_not_supported(
            || {
                create_audio_buffer(1, 1, 2_999.0);
            },
            sample_rate_message,
        );
        expect_not_supported(
            || {
                create_audio_buffer(1, 1, 768_001.0);
            },
            sample_rate_message,
        );
        expect_not_supported(
            || {
                create_audio_buffer(1, 1, f32::NAN);
            },
            sample_rate_message,
        );
    }

    #[test]
    fn checks_channels_before_length_before_sample_rate() {
        expect_not_supported(
            || {
                create_audio_buffer(0, 0, f32::NAN);
            },
            "AudioBuffer: numberOfChannels must be between 1 and 32",
        );
    }
}
