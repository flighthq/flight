use flight_host::contract::*;

fn web_host() -> HostCapabilityBackend {
    return HostCapabilityBackend {
        entry_point: "webHost".to_string(),
        package_name: "@flighthq/host-web".to_string(),
        platform: "Web".to_string(),
    };
}

mod explain_host_capability_slot {
    use super::*;

    #[test]
    fn names_the_accessor_the_slot_the_consequence_and_the_fix_when_absent() {
        let explanation = explain_host_capability_slot(
            "HostVideoCapability",
            "video",
            "playback",
            false,
            "nothing can decode or present video",
            "build the host from webHost in @flighthq/host-web",
            vec![web_host()],
        );
        assert_eq!(
            explanation.message,
            "getHostVideo: host.video.playback is absent, so nothing can decode or present video \u{2014} build the host from webHost in @flighthq/host-web"
        );
        assert_eq!(explanation.capability, "HostVideoCapability");
        assert_eq!(explanation.group, "video");
        assert_eq!(explanation.slot, "playback");
        assert!(!explanation.is_present);
        assert_eq!(explanation.backends, vec![web_host()]);
    }

    #[test]
    fn reports_presence_and_still_carries_the_backends_as_data() {
        let explanation = explain_host_capability_slot(
            "HostAudioDeviceCapability",
            "audio",
            "device",
            true,
            "no audio can be decoded or played",
            "build the host from webHost in @flighthq/host-web",
            vec![web_host()],
        );
        assert!(explanation.is_present);
        assert_eq!(
            explanation.message,
            "getHostAudioDevice: host.audio.device is present"
        );
        assert_eq!(explanation.backends.len(), 1);
    }
}
