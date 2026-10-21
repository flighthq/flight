use super::*;

mod get_audio_bus_mixer_operation_string {
    use super::*;

    #[test]
    fn returns_exact_source_names() {
        assert_eq!(
            get_audio_bus_mixer_operation_string(AudioBusMixerOperation::Gain),
            "gain"
        );
        assert_eq!(
            get_audio_bus_mixer_operation_string(AudioBusMixerOperation::Mute),
            "mute"
        );
        assert_eq!(
            get_audio_bus_mixer_operation_string(AudioBusMixerOperation::Pan),
            "pan"
        );
    }
}

mod get_audio_device_operation_string {
    use super::*;

    #[test]
    fn returns_exact_host_member_names() {
        assert_eq!(
            get_audio_device_operation_string(AudioDeviceOperation::CreateBuffer),
            "createBuffer"
        );
        assert_eq!(
            get_audio_device_operation_string(AudioDeviceOperation::FadeSourceGain),
            "fadeSourceGain"
        );
        assert_eq!(
            get_audio_device_operation_string(AudioDeviceOperation::StopSource),
            "stopSource"
        );
    }
}

mod get_media_ready_state_string {
    use super::*;

    #[test]
    fn returns_exact_source_names() {
        assert_eq!(
            get_media_ready_state_string(MediaReadyState::Buffering),
            "buffering"
        );
        assert_eq!(
            get_media_ready_state_string(MediaReadyState::Error),
            "error"
        );
        assert_eq!(get_media_ready_state_string(MediaReadyState::Idle), "idle");
        assert_eq!(
            get_media_ready_state_string(MediaReadyState::Ready),
            "ready"
        );
    }
}

mod parse_audio_bus_mixer_operation {
    use super::*;

    #[test]
    fn parses_known_names_and_rejects_unknown_names() {
        assert_eq!(
            parse_audio_bus_mixer_operation("gain"),
            Some(AudioBusMixerOperation::Gain)
        );
        assert_eq!(
            parse_audio_bus_mixer_operation("mute"),
            Some(AudioBusMixerOperation::Mute)
        );
        assert_eq!(
            parse_audio_bus_mixer_operation("pan"),
            Some(AudioBusMixerOperation::Pan)
        );
        assert_eq!(parse_audio_bus_mixer_operation("vendor"), None);
    }
}

mod parse_audio_device_operation {
    use super::*;

    #[test]
    fn round_trips_every_operation_and_rejects_unknown_names() {
        let values = [
            AudioDeviceOperation::CreateBuffer,
            AudioDeviceOperation::CreateDevice,
            AudioDeviceOperation::CreateSource,
            AudioDeviceOperation::DestroyBuffer,
            AudioDeviceOperation::DestroyDevice,
            AudioDeviceOperation::DestroySource,
            AudioDeviceOperation::FadeSourceGain,
            AudioDeviceOperation::GetDeviceTime,
            AudioDeviceOperation::OnSourceEnded,
            AudioDeviceOperation::ResumeDevice,
            AudioDeviceOperation::SetSourceGain,
            AudioDeviceOperation::SetSourcePan,
            AudioDeviceOperation::SetSourcePlaybackRate,
            AudioDeviceOperation::StartSource,
            AudioDeviceOperation::StopSource,
        ];
        for value in values {
            assert_eq!(
                parse_audio_device_operation(get_audio_device_operation_string(value)),
                Some(value)
            );
        }
        assert_eq!(parse_audio_device_operation("vendor"), None);
    }
}

mod parse_media_ready_state {
    use super::*;

    #[test]
    fn parses_known_names_and_rejects_unknown_names() {
        assert_eq!(
            parse_media_ready_state("buffering"),
            Some(MediaReadyState::Buffering)
        );
        assert_eq!(
            parse_media_ready_state("error"),
            Some(MediaReadyState::Error)
        );
        assert_eq!(parse_media_ready_state("idle"), Some(MediaReadyState::Idle));
        assert_eq!(
            parse_media_ready_state("ready"),
            Some(MediaReadyState::Ready)
        );
        assert_eq!(parse_media_ready_state("vendor"), None);
    }
}
