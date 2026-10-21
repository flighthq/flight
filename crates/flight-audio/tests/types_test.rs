use flight_audio::*;

mod get_audio_channel_state_string {
    use super::*;

    #[test]
    fn returns_the_exact_source_strings() {
        assert_eq!(
            get_audio_channel_state_string(AudioChannelState::Complete),
            "complete"
        );
        assert_eq!(
            get_audio_channel_state_string(AudioChannelState::Paused),
            "paused"
        );
        assert_eq!(
            get_audio_channel_state_string(AudioChannelState::Playing),
            "playing"
        );
        assert_eq!(
            get_audio_channel_state_string(AudioChannelState::Stopped),
            "stopped"
        );
    }
}

mod get_audio_resource_failure_kind_string {
    use super::*;

    #[test]
    fn returns_the_exact_source_strings() {
        assert_eq!(
            get_audio_resource_failure_kind_string(AudioResourceFailureKind::Error),
            "Error"
        );
        assert_eq!(
            get_audio_resource_failure_kind_string(AudioResourceFailureKind::Unavailable),
            "Unavailable"
        );
    }
}

mod get_audio_resource_reference_kind_string {
    use super::*;

    #[test]
    fn returns_the_exact_source_strings() {
        assert_eq!(
            get_audio_resource_reference_kind_string(AudioResourceReferenceKind::Embedded),
            "Embedded"
        );
        assert_eq!(
            get_audio_resource_reference_kind_string(AudioResourceReferenceKind::External),
            "External"
        );
    }
}

mod parse_audio_channel_state {
    use super::*;

    #[test]
    fn accepts_only_the_exact_source_strings() {
        assert_eq!(
            parse_audio_channel_state("complete"),
            Some(AudioChannelState::Complete)
        );
        assert_eq!(
            parse_audio_channel_state("paused"),
            Some(AudioChannelState::Paused)
        );
        assert_eq!(
            parse_audio_channel_state("playing"),
            Some(AudioChannelState::Playing)
        );
        assert_eq!(
            parse_audio_channel_state("stopped"),
            Some(AudioChannelState::Stopped)
        );
        assert_eq!(parse_audio_channel_state("Playing"), None);
    }
}

mod parse_audio_resource_failure_kind {
    use super::*;

    #[test]
    fn accepts_only_the_exact_source_strings() {
        assert_eq!(
            parse_audio_resource_failure_kind("Error"),
            Some(AudioResourceFailureKind::Error)
        );
        assert_eq!(
            parse_audio_resource_failure_kind("Unavailable"),
            Some(AudioResourceFailureKind::Unavailable)
        );
        assert_eq!(parse_audio_resource_failure_kind("error"), None);
    }
}

mod parse_audio_resource_reference_kind {
    use super::*;

    #[test]
    fn accepts_only_the_exact_source_strings() {
        assert_eq!(
            parse_audio_resource_reference_kind("Embedded"),
            Some(AudioResourceReferenceKind::Embedded)
        );
        assert_eq!(
            parse_audio_resource_reference_kind("External"),
            Some(AudioResourceReferenceKind::External)
        );
        assert_eq!(parse_audio_resource_reference_kind("external"), None);
    }
}
