use flight_host::contract::*;

use crate::fixtures::*;
use crate::host_groups::HOST_GROUPS;

type Accessor = (&'static str, fn(&Host) -> bool, fn(&Host) -> bool);

// The query lane's accessors (source name, get-is-some, has), written out: the source reads them by
// reflecting over the module's exports, which Rust has no runtime form of.
const ACCESSORS: [Accessor; 28] = [
    (
        "getHostAudioDevice",
        |host| get_host_audio_device(host).is_some(),
        has_host_audio_device,
    ),
    (
        "getHostAudioMixer",
        |host| get_host_audio_mixer(host).is_some(),
        has_host_audio_mixer,
    ),
    (
        "getHostBitmapEncode",
        |host| get_host_bitmap_encode(host).is_some(),
        has_host_bitmap_encode,
    ),
    (
        "getHostBitmapReadback",
        |host| get_host_bitmap_readback(host).is_some(),
        has_host_bitmap_readback,
    ),
    (
        "getHostClipboardFormats",
        |host| get_host_clipboard_formats(host).is_some(),
        has_host_clipboard_formats,
    ),
    (
        "getHostDevice",
        |host| get_host_device(host).is_some(),
        has_host_device,
    ),
    (
        "getHostFileSystem",
        |host| get_host_file_system(host).is_some(),
        has_host_file_system,
    ),
    (
        "getHostFontLoading",
        |host| get_host_font_loading(host).is_some(),
        has_host_font_loading,
    ),
    (
        "getHostGeolocation",
        |host| get_host_geolocation(host).is_some(),
        has_host_geolocation,
    ),
    (
        "getHostGlyphRasterizer",
        |host| get_host_glyph_rasterizer(host).is_some(),
        has_host_glyph_rasterizer,
    ),
    (
        "getHostHaptics",
        |host| get_host_haptics(host).is_some(),
        has_host_haptics,
    ),
    (
        "getHostImage",
        |host| get_host_image(host).is_some(),
        has_host_image,
    ),
    (
        "getHostInputIngress",
        |host| get_host_input_ingress(host).is_some(),
        has_host_input_ingress,
    ),
    (
        "getHostLifecycle",
        |host| get_host_lifecycle(host).is_some(),
        has_host_lifecycle,
    ),
    (
        "getHostNet",
        |host| get_host_net(host).is_some(),
        has_host_net,
    ),
    (
        "getHostNotificationPermission",
        |host| get_host_notification_permission(host).is_some(),
        has_host_notification_permission,
    ),
    (
        "getHostPlatform",
        |host| get_host_platform(host).is_some(),
        has_host_platform,
    ),
    (
        "getHostPowerKeepAwake",
        |host| get_host_power_keep_awake(host).is_some(),
        has_host_power_keep_awake,
    ),
    (
        "getHostPreferences",
        |host| get_host_preferences(host).is_some(),
        has_host_preferences,
    ),
    (
        "getHostPreferencesPersistenceQuery",
        |host| get_host_preferences_persistence_query(host).is_some(),
        has_host_preferences_persistence_query,
    ),
    (
        "getHostScreenQuery",
        |host| get_host_screen_query(host).is_some(),
        has_host_screen_query,
    ),
    (
        "getHostSensors",
        |host| get_host_sensors(host).is_some(),
        has_host_sensors,
    ),
    (
        "getHostSocket",
        |host| get_host_socket(host).is_some(),
        has_host_socket,
    ),
    (
        "getHostSoftKeyboardInfo",
        |host| get_host_soft_keyboard_info(host).is_some(),
        has_host_soft_keyboard_info,
    ),
    (
        "getHostTextSegmenter",
        |host| get_host_text_segmenter(host).is_some(),
        has_host_text_segmenter,
    ),
    (
        "getHostTextShaper",
        |host| get_host_text_shaper(host).is_some(),
        has_host_text_shaper,
    ),
    (
        "getHostVideo",
        |host| get_host_video(host).is_some(),
        has_host_video,
    ),
    (
        "getHostWgpu",
        |host| get_host_wgpu(host).is_some(),
        has_host_wgpu,
    ),
];

fn explainers() -> [fn(&Host) -> HostCapabilityExplanation; 7] {
    return [
        explain_host_audio_device,
        explain_host_audio_mixer,
        explain_host_image,
        explain_host_input_ingress,
        explain_host_text_segmenter,
        explain_host_text_shaper,
        explain_host_video,
    ];
}

fn group_slots(host: &Host, name: &str) -> Vec<String> {
    let mut slots = explain_host(host)
        .groups
        .into_iter()
        .find(|group| group.group == name)
        .expect("a carried group")
        .slots;
    slots.sort();
    return slots;
}

fn accessor_name(capability: &str) -> String {
    return format!("get{}", capability.strip_suffix("Capability").unwrap());
}

mod explain_host {
    use super::*;

    #[test]
    fn enumerates_every_capability_group_the_host_object_carries() {
        let names: Vec<String> = explain_host(&create_host())
            .groups
            .into_iter()
            .map(|group| group.group)
            .collect();
        assert_eq!(names, HOST_GROUPS);
    }

    #[test]
    fn lists_the_slot_keys_a_populated_group_actually_holds() {
        let mut host = create_host();
        host.audio.codec = Some(fixture_host_audio_codec_capability());
        host.audio.device = Some(fixture_host_audio_device_capability());
        assert_eq!(group_slots(&host, "audio"), vec!["codec", "device"]);
    }

    #[test]
    fn reports_host_window_through_its_slots_because_window_is_a_group_like_every_other() {
        let mut host = create_host();
        host.window.geometry = Some(fixture_host_window_geometry_capability());
        host.window.lifecycle = Some(fixture_host_window_lifecycle_capability());
        assert_eq!(group_slots(&host, "window"), vec!["geometry", "lifecycle"]);
    }

    #[test]
    fn reports_every_covered_capability_as_absent_on_an_empty_host() {
        let capabilities = explain_host(&create_host()).capabilities;
        assert!(!capabilities.is_empty());
        assert!(capabilities.iter().all(|entry| !entry.is_present));
        assert!(
            capabilities
                .iter()
                .any(|entry| entry.group == "video" && entry.slot == "playback")
        );
    }

    #[test]
    fn flips_a_covered_capability_to_present_when_its_slot_is_filled() {
        let mut host = create_host();
        fill_slot(&mut host, "video", "playback");
        let capabilities = explain_host(&host).capabilities;
        let video = capabilities
            .iter()
            .find(|entry| entry.slot == "playback")
            .unwrap();
        assert!(video.is_present);
        assert_eq!(video.capability, "HostVideoCapability");
    }

    #[test]
    fn covers_exactly_the_slots_host_query_exposes_accessors_for_in_both_directions() {
        let mut censused: Vec<String> = explain_host(&create_host())
            .capabilities
            .iter()
            .map(|entry| accessor_name(&entry.capability))
            .collect();
        censused.sort();
        let mut exported: Vec<String> = ACCESSORS
            .iter()
            .map(|(name, _, _)| name.to_string())
            .collect();
        exported.sort();
        assert_eq!(censused, exported);
    }

    #[test]
    fn names_for_every_covered_slot_the_group_and_slot_its_own_accessor_reads() {
        // The census supplies the (group, slot) pair; the accessor is the independent reading of it.
        for coverage in explain_host(&create_host()).capabilities {
            let name = accessor_name(&coverage.capability);
            let (_, get, _) = ACCESSORS
                .iter()
                .find(|(accessor, _, _)| *accessor == name)
                .expect("an accessor");
            let mut host = create_host();
            fill_slot(&mut host, &coverage.group, &coverage.slot);
            assert!(
                get(&host),
                "{} reads host.{}.{}",
                name,
                coverage.group,
                coverage.slot
            );
        }
    }

    #[test]
    fn keeps_every_per_capability_explainer_naming_the_backends_it_returns_as_data() {
        for explain in explainers() {
            let explanation = explain(&create_host());
            assert!(
                !explanation.backends.is_empty(),
                "{}",
                explanation.capability
            );
            for backend in &explanation.backends {
                assert!(
                    explanation.message.contains(&backend.entry_point),
                    "{}",
                    explanation.capability
                );
                assert!(
                    explanation.message.contains(&backend.package_name),
                    "{}",
                    explanation.capability
                );
            }
        }
    }

    #[test]
    fn pairs_every_get_host_accessor_with_a_has_host_accessor() {
        for (group, slot) in explain_host(&create_host())
            .capabilities
            .iter()
            .map(|entry| (entry.group.clone(), entry.slot.clone()))
        {
            let mut host = create_host();
            fill_slot(&mut host, &group, &slot);
            for (name, get, has) in ACCESSORS {
                assert_eq!(has(&host), get(&host), "has/get disagree for {}", name);
                assert_eq!(
                    has(&create_host()),
                    get(&create_host()),
                    "has/get disagree for {}",
                    name
                );
            }
        }
    }
}

mod explain_host_audio_device {
    use super::*;

    #[test]
    fn names_the_accessor_the_slot_and_where_to_get_the_capability_when_it_is_absent() {
        let explanation = explain_host_audio_device(&create_host());
        assert!(!explanation.is_present);
        assert_eq!(explanation.group, "audio");
        assert_eq!(explanation.slot, "device");
        assert_eq!(explanation.capability, "HostAudioDeviceCapability");
        assert!(explanation.message.contains("getHostAudioDevice"));
        let packages: Vec<&str> = explanation
            .backends
            .iter()
            .map(|backend| backend.package_name.as_str())
            .collect();
        assert_eq!(packages, vec!["@flighthq/host-web"]);
    }

    #[test]
    fn reports_presence_without_a_remedy_when_the_slot_is_filled() {
        let mut host = create_host();
        fill_slot(&mut host, "audio", "device");
        let explanation = explain_host_audio_device(&host);
        assert!(explanation.is_present);
        assert_eq!(
            explanation.message,
            "getHostAudioDevice: host.audio.device is present"
        );
    }
}

mod explain_host_audio_mixer {
    use super::*;

    #[test]
    fn explains_an_absent_mixer_against_the_audio_group() {
        let explanation = explain_host_audio_mixer(&create_host());
        assert_eq!(explanation.group, "audio");
        assert_eq!(explanation.slot, "mixer");
        assert!(!explanation.is_present);
        assert!(!explanation.backends.is_empty());
    }
}

mod explain_host_image {
    use super::*;

    #[test]
    fn explains_an_absent_image_loader_against_the_image_group() {
        let explanation = explain_host_image(&create_host());
        assert_eq!(explanation.group, "image");
        assert_eq!(explanation.slot, "loader");
        assert_eq!(explanation.capability, "HostImageCapability");
        assert!(!explanation.is_present);
    }
}

mod explain_host_input_ingress {
    use super::*;

    #[test]
    fn explains_an_absent_ingress_capability_against_the_input_group() {
        let explanation = explain_host_input_ingress(&create_host());
        assert_eq!(explanation.group, "input");
        assert_eq!(explanation.slot, "ingress");
        assert!(!explanation.is_present);
    }
}

mod explain_host_text_segmenter {
    use super::*;

    #[test]
    fn points_at_the_package_that_builds_a_segmenter_rather_than_at_a_host_backend() {
        let explanation = explain_host_text_segmenter(&create_host());
        let packages: Vec<&str> = explanation
            .backends
            .iter()
            .map(|backend| backend.package_name.as_str())
            .collect();
        assert_eq!(packages, vec!["@flighthq/textsegment"]);
        assert!(
            explanation
                .message
                .contains("createWebTextSegmenterBackend")
        );
    }
}

mod explain_host_text_shaper {
    use super::*;

    #[test]
    fn points_at_the_package_that_ships_a_shaper_and_the_provider_to_pass() {
        let explanation = explain_host_text_shaper(&create_host());
        let packages: Vec<&str> = explanation
            .backends
            .iter()
            .map(|backend| backend.package_name.as_str())
            .collect();
        assert_eq!(packages, vec!["@flighthq/host-web"]);
        assert!(explanation.message.contains("webHostTextShaper"));
    }

    #[test]
    fn reports_presence_when_the_shaper_is_composed_into_the_text_shaper_group() {
        let mut host = create_host();
        fill_slot(&mut host, "textShaper", "shaper");
        assert!(explain_host_text_shaper(&host).is_present);
    }
}

mod explain_host_video {
    use super::*;

    #[test]
    fn explains_an_absent_video_capability_against_the_video_group() {
        let explanation = explain_host_video(&create_host());
        assert_eq!(explanation.group, "video");
        assert_eq!(explanation.slot, "playback");
        assert_eq!(explanation.capability, "HostVideoCapability");
        assert!(!explanation.is_present);
    }
}
