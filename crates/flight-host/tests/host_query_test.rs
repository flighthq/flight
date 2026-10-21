use flight_host::contract::*;

use crate::fixtures::fill_slot;

// Each accessor is exercised through a host built by GROUP AND SLOT NAME, so the spelling the test
// asserts is independent of the field access the accessor compiles to. The decoy case is what the flat
// group structure makes necessary: slot names collide across groups (`device.info`, `platform.info`,
// `softKeyboard.info`), so each accessor is also handed a host with EVERY other covered slot filled
// and its own empty, and must still return None. The `wgpu.context` cases are pending its owner.

// The (group, slot) path of every accessor, written out rather than read from the coverage table: the
// decoys only test the accessors if their ground truth comes from somewhere the accessors do not.
const COVERED_SLOTS: [(&str, &str); 27] = [
    ("audio", "device"),
    ("audio", "mixer"),
    ("bitmap", "encode"),
    ("bitmap", "readback"),
    ("clipboard", "formats"),
    ("device", "info"),
    ("fileSystem", "access"),
    ("font", "loader"),
    ("geolocation", "position"),
    ("glyph", "rasterizer"),
    ("haptics", "engine"),
    ("image", "loader"),
    ("input", "ingress"),
    ("lifecycle", "state"),
    ("net", "http"),
    ("notification", "permission"),
    ("platform", "info"),
    ("power", "keepAwake"),
    ("preferences", "local"),
    ("screen", "query"),
    ("sensors", "query"),
    ("socket", "connection"),
    ("softKeyboard", "info"),
    ("preferences", "persistenceQuery"),
    ("textSegment", "segmenter"),
    ("textShaper", "shaper"),
    ("video", "playback"),
];

fn host_with_slot(group: &str, slot: &str) -> Host {
    let mut host = create_host();
    fill_slot(&mut host, group, slot);
    return host;
}

fn host_with_every_covered_slot_except(group: &str, slot: &str) -> Host {
    let mut host = create_host();
    for (covered_group, covered_slot) in COVERED_SLOTS {
        if covered_group == group && covered_slot == slot {
            continue;
        }
        fill_slot(&mut host, covered_group, covered_slot);
    }
    return host;
}

mod get_host_audio_device {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_audio_device() {
        let host = host_with_slot("audio", "device");
        assert!(std::ptr::eq(
            get_host_audio_device(&host).unwrap(),
            host.audio.device.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_audio_device(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_audio_device(&host_with_every_covered_slot_except("audio", "device"))
                .is_none()
        );
    }
}

mod get_host_audio_mixer {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_audio_mixer() {
        let host = host_with_slot("audio", "mixer");
        assert!(std::ptr::eq(
            get_host_audio_mixer(&host).unwrap(),
            host.audio.mixer.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_audio_mixer(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_audio_mixer(&host_with_every_covered_slot_except("audio", "mixer")).is_none()
        );
    }
}

mod get_host_bitmap_encode {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_bitmap_encode() {
        let host = host_with_slot("bitmap", "encode");
        assert!(std::ptr::eq(
            get_host_bitmap_encode(&host).unwrap(),
            host.bitmap.encode.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_bitmap_encode(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_bitmap_encode(&host_with_every_covered_slot_except("bitmap", "encode"))
                .is_none()
        );
    }
}

mod get_host_bitmap_readback {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_bitmap_readback() {
        let host = host_with_slot("bitmap", "readback");
        assert!(std::ptr::eq(
            get_host_bitmap_readback(&host).unwrap(),
            host.bitmap.readback.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_bitmap_readback(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_bitmap_readback(&host_with_every_covered_slot_except("bitmap", "readback"))
                .is_none()
        );
    }
}

mod get_host_clipboard_formats {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_clipboard_formats() {
        let host = host_with_slot("clipboard", "formats");
        assert!(std::ptr::eq(
            get_host_clipboard_formats(&host).unwrap(),
            host.clipboard.formats.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_clipboard_formats(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_clipboard_formats(&host_with_every_covered_slot_except(
                "clipboard",
                "formats"
            ))
            .is_none()
        );
    }
}

mod get_host_device {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_device_info() {
        let host = host_with_slot("device", "info");
        assert!(std::ptr::eq(
            get_host_device(&host).unwrap(),
            host.device.info.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_device(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(get_host_device(&host_with_every_covered_slot_except("device", "info")).is_none());
    }
}

mod get_host_file_system {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_file_system_access() {
        let host = host_with_slot("fileSystem", "access");
        assert!(std::ptr::eq(
            get_host_file_system(&host).unwrap(),
            host.file_system.access.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_file_system(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_file_system(&host_with_every_covered_slot_except("fileSystem", "access"))
                .is_none()
        );
    }
}

mod get_host_font_loading {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_font_loader() {
        let host = host_with_slot("font", "loader");
        assert!(std::ptr::eq(
            get_host_font_loading(&host).unwrap(),
            host.font.loader.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_font_loading(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_font_loading(&host_with_every_covered_slot_except("font", "loader")).is_none()
        );
    }
}

mod get_host_geolocation {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_geolocation_position() {
        let host = host_with_slot("geolocation", "position");
        assert!(std::ptr::eq(
            get_host_geolocation(&host).unwrap(),
            host.geolocation.position.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_geolocation(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_geolocation(&host_with_every_covered_slot_except(
                "geolocation",
                "position"
            ))
            .is_none()
        );
    }
}

mod get_host_glyph_rasterizer {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_glyph_rasterizer() {
        let host = host_with_slot("glyph", "rasterizer");
        assert!(std::ptr::eq(
            get_host_glyph_rasterizer(&host).unwrap(),
            host.glyph.rasterizer.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_glyph_rasterizer(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_glyph_rasterizer(&host_with_every_covered_slot_except("glyph", "rasterizer"))
                .is_none()
        );
    }
}

mod get_host_haptics {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_haptics_engine() {
        let host = host_with_slot("haptics", "engine");
        assert!(std::ptr::eq(
            get_host_haptics(&host).unwrap(),
            host.haptics.engine.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_haptics(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_haptics(&host_with_every_covered_slot_except("haptics", "engine")).is_none()
        );
    }
}

mod get_host_image {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_image_loader() {
        let host = host_with_slot("image", "loader");
        assert!(std::ptr::eq(
            get_host_image(&host).unwrap(),
            host.image.loader.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_image(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(get_host_image(&host_with_every_covered_slot_except("image", "loader")).is_none());
    }
}

mod get_host_input_ingress {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_input_ingress() {
        let host = host_with_slot("input", "ingress");
        assert!(std::ptr::eq(
            get_host_input_ingress(&host).unwrap(),
            host.input.ingress.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_input_ingress(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_input_ingress(&host_with_every_covered_slot_except("input", "ingress"))
                .is_none()
        );
    }
}

mod get_host_lifecycle {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_lifecycle_state() {
        let host = host_with_slot("lifecycle", "state");
        assert!(std::ptr::eq(
            get_host_lifecycle(&host).unwrap(),
            host.lifecycle.state.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_lifecycle(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_lifecycle(&host_with_every_covered_slot_except("lifecycle", "state"))
                .is_none()
        );
    }
}

mod get_host_net {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_net_http() {
        let host = host_with_slot("net", "http");
        assert!(std::ptr::eq(
            get_host_net(&host).unwrap(),
            host.net.http.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_net(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(get_host_net(&host_with_every_covered_slot_except("net", "http")).is_none());
    }
}

mod get_host_notification_permission {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_notification_permission() {
        let host = host_with_slot("notification", "permission");
        assert!(std::ptr::eq(
            get_host_notification_permission(&host).unwrap(),
            host.notification.permission.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_notification_permission(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_notification_permission(&host_with_every_covered_slot_except(
                "notification",
                "permission"
            ))
            .is_none()
        );
    }
}

mod get_host_platform {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_platform_info() {
        let host = host_with_slot("platform", "info");
        assert!(std::ptr::eq(
            get_host_platform(&host).unwrap(),
            host.platform.info.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_platform(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_platform(&host_with_every_covered_slot_except("platform", "info")).is_none()
        );
    }
}

mod get_host_power_keep_awake {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_power_keep_awake() {
        let host = host_with_slot("power", "keepAwake");
        assert!(std::ptr::eq(
            get_host_power_keep_awake(&host).unwrap(),
            host.power.keep_awake.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_power_keep_awake(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_power_keep_awake(&host_with_every_covered_slot_except("power", "keepAwake"))
                .is_none()
        );
    }
}

mod get_host_preferences {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_preferences_local() {
        let host = host_with_slot("preferences", "local");
        assert!(std::ptr::eq(
            get_host_preferences(&host).unwrap(),
            host.preferences.local.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_preferences(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_preferences(&host_with_every_covered_slot_except("preferences", "local"))
                .is_none()
        );
    }
}

mod get_host_preferences_persistence_query {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_preferences_persistence_query() {
        let host = host_with_slot("preferences", "persistenceQuery");
        assert!(std::ptr::eq(
            get_host_preferences_persistence_query(&host).unwrap(),
            host.preferences.persistence_query.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_preferences_persistence_query(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_preferences_persistence_query(&host_with_every_covered_slot_except(
                "preferences",
                "persistenceQuery"
            ))
            .is_none()
        );
    }
}

mod get_host_screen_query {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_screen_query() {
        let host = host_with_slot("screen", "query");
        assert!(std::ptr::eq(
            get_host_screen_query(&host).unwrap(),
            host.screen.query.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_screen_query(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_screen_query(&host_with_every_covered_slot_except("screen", "query"))
                .is_none()
        );
    }
}

mod get_host_sensors {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_sensors_query() {
        let host = host_with_slot("sensors", "query");
        assert!(std::ptr::eq(
            get_host_sensors(&host).unwrap(),
            host.sensors.query.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_sensors(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_sensors(&host_with_every_covered_slot_except("sensors", "query")).is_none()
        );
    }
}

mod get_host_socket {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_socket_connection() {
        let host = host_with_slot("socket", "connection");
        assert!(std::ptr::eq(
            get_host_socket(&host).unwrap(),
            host.socket.connection.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_socket(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_socket(&host_with_every_covered_slot_except("socket", "connection")).is_none()
        );
    }
}

mod get_host_soft_keyboard_info {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_soft_keyboard_info() {
        let host = host_with_slot("softKeyboard", "info");
        assert!(std::ptr::eq(
            get_host_soft_keyboard_info(&host).unwrap(),
            host.soft_keyboard.info.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_soft_keyboard_info(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_soft_keyboard_info(&host_with_every_covered_slot_except(
                "softKeyboard",
                "info"
            ))
            .is_none()
        );
    }
}

mod get_host_text_segmenter {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_text_segment_segmenter() {
        let host = host_with_slot("textSegment", "segmenter");
        assert!(std::ptr::eq(
            get_host_text_segmenter(&host).unwrap(),
            host.text_segment.segmenter.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_text_segmenter(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_text_segmenter(&host_with_every_covered_slot_except(
                "textSegment",
                "segmenter"
            ))
            .is_none()
        );
    }
}

mod get_host_text_shaper {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_text_shaper_shaper() {
        let host = host_with_slot("textShaper", "shaper");
        assert!(std::ptr::eq(
            get_host_text_shaper(&host).unwrap(),
            host.text_shaper.shaper.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_text_shaper(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_text_shaper(&host_with_every_covered_slot_except("textShaper", "shaper"))
                .is_none()
        );
    }
}

mod get_host_video {
    use super::*;

    #[test]
    fn returns_the_capability_held_in_host_video_playback() {
        let host = host_with_slot("video", "playback");
        assert!(std::ptr::eq(
            get_host_video(&host).unwrap(),
            host.video.playback.as_ref().unwrap()
        ));
    }

    #[test]
    fn returns_null_when_the_slot_is_empty() {
        assert!(get_host_video(&create_host()).is_none());
    }

    #[test]
    fn returns_null_when_every_other_covered_slot_is_filled_and_this_one_is_not() {
        assert!(
            get_host_video(&host_with_every_covered_slot_except("video", "playback")).is_none()
        );
    }
}

mod has_host_audio_device {
    use super::*;

    #[test]
    fn is_true_only_when_host_audio_device_holds_a_capability() {
        assert!(has_host_audio_device(&host_with_slot("audio", "device")));
        assert!(!has_host_audio_device(
            &host_with_every_covered_slot_except("audio", "device")
        ));
        assert!(!has_host_audio_device(&create_host()));
    }
}

mod has_host_audio_mixer {
    use super::*;

    #[test]
    fn is_true_only_when_host_audio_mixer_holds_a_capability() {
        assert!(has_host_audio_mixer(&host_with_slot("audio", "mixer")));
        assert!(!has_host_audio_mixer(&host_with_every_covered_slot_except(
            "audio", "mixer"
        )));
        assert!(!has_host_audio_mixer(&create_host()));
    }
}

mod has_host_bitmap_encode {
    use super::*;

    #[test]
    fn is_true_only_when_host_bitmap_encode_holds_a_capability() {
        assert!(has_host_bitmap_encode(&host_with_slot("bitmap", "encode")));
        assert!(!has_host_bitmap_encode(
            &host_with_every_covered_slot_except("bitmap", "encode")
        ));
        assert!(!has_host_bitmap_encode(&create_host()));
    }
}

mod has_host_bitmap_readback {
    use super::*;

    #[test]
    fn is_true_only_when_host_bitmap_readback_holds_a_capability() {
        assert!(has_host_bitmap_readback(&host_with_slot(
            "bitmap", "readback"
        )));
        assert!(!has_host_bitmap_readback(
            &host_with_every_covered_slot_except("bitmap", "readback")
        ));
        assert!(!has_host_bitmap_readback(&create_host()));
    }
}

mod has_host_clipboard_formats {
    use super::*;

    #[test]
    fn is_true_only_when_host_clipboard_formats_holds_a_capability() {
        assert!(has_host_clipboard_formats(&host_with_slot(
            "clipboard",
            "formats"
        )));
        assert!(!has_host_clipboard_formats(
            &host_with_every_covered_slot_except("clipboard", "formats")
        ));
        assert!(!has_host_clipboard_formats(&create_host()));
    }
}

mod has_host_device {
    use super::*;

    #[test]
    fn is_true_only_when_host_device_info_holds_a_capability() {
        assert!(has_host_device(&host_with_slot("device", "info")));
        assert!(!has_host_device(&host_with_every_covered_slot_except(
            "device", "info"
        )));
        assert!(!has_host_device(&create_host()));
    }
}

mod has_host_file_system {
    use super::*;

    #[test]
    fn is_true_only_when_host_file_system_access_holds_a_capability() {
        assert!(has_host_file_system(&host_with_slot(
            "fileSystem",
            "access"
        )));
        assert!(!has_host_file_system(&host_with_every_covered_slot_except(
            "fileSystem",
            "access"
        )));
        assert!(!has_host_file_system(&create_host()));
    }
}

mod has_host_font_loading {
    use super::*;

    #[test]
    fn is_true_only_when_host_font_loader_holds_a_capability() {
        assert!(has_host_font_loading(&host_with_slot("font", "loader")));
        assert!(!has_host_font_loading(
            &host_with_every_covered_slot_except("font", "loader")
        ));
        assert!(!has_host_font_loading(&create_host()));
    }
}

mod has_host_geolocation {
    use super::*;

    #[test]
    fn is_true_only_when_host_geolocation_position_holds_a_capability() {
        assert!(has_host_geolocation(&host_with_slot(
            "geolocation",
            "position"
        )));
        assert!(!has_host_geolocation(&host_with_every_covered_slot_except(
            "geolocation",
            "position"
        )));
        assert!(!has_host_geolocation(&create_host()));
    }
}

mod has_host_glyph_rasterizer {
    use super::*;

    #[test]
    fn is_true_only_when_host_glyph_rasterizer_holds_a_capability() {
        assert!(has_host_glyph_rasterizer(&host_with_slot(
            "glyph",
            "rasterizer"
        )));
        assert!(!has_host_glyph_rasterizer(
            &host_with_every_covered_slot_except("glyph", "rasterizer")
        ));
        assert!(!has_host_glyph_rasterizer(&create_host()));
    }
}

mod has_host_haptics {
    use super::*;

    #[test]
    fn is_true_only_when_host_haptics_engine_holds_a_capability() {
        assert!(has_host_haptics(&host_with_slot("haptics", "engine")));
        assert!(!has_host_haptics(&host_with_every_covered_slot_except(
            "haptics", "engine"
        )));
        assert!(!has_host_haptics(&create_host()));
    }
}

mod has_host_image {
    use super::*;

    #[test]
    fn is_true_only_when_host_image_loader_holds_a_capability() {
        assert!(has_host_image(&host_with_slot("image", "loader")));
        assert!(!has_host_image(&host_with_every_covered_slot_except(
            "image", "loader"
        )));
        assert!(!has_host_image(&create_host()));
    }
}

mod has_host_input_ingress {
    use super::*;

    #[test]
    fn is_true_only_when_host_input_ingress_holds_a_capability() {
        assert!(has_host_input_ingress(&host_with_slot("input", "ingress")));
        assert!(!has_host_input_ingress(
            &host_with_every_covered_slot_except("input", "ingress")
        ));
        assert!(!has_host_input_ingress(&create_host()));
    }
}

mod has_host_lifecycle {
    use super::*;

    #[test]
    fn is_true_only_when_host_lifecycle_state_holds_a_capability() {
        assert!(has_host_lifecycle(&host_with_slot("lifecycle", "state")));
        assert!(!has_host_lifecycle(&host_with_every_covered_slot_except(
            "lifecycle",
            "state"
        )));
        assert!(!has_host_lifecycle(&create_host()));
    }
}

mod has_host_net {
    use super::*;

    #[test]
    fn is_true_only_when_host_net_http_holds_a_capability() {
        assert!(has_host_net(&host_with_slot("net", "http")));
        assert!(!has_host_net(&host_with_every_covered_slot_except(
            "net", "http"
        )));
        assert!(!has_host_net(&create_host()));
    }
}

mod has_host_notification_permission {
    use super::*;

    #[test]
    fn is_true_only_when_host_notification_permission_holds_a_capability() {
        assert!(has_host_notification_permission(&host_with_slot(
            "notification",
            "permission"
        )));
        assert!(!has_host_notification_permission(
            &host_with_every_covered_slot_except("notification", "permission")
        ));
        assert!(!has_host_notification_permission(&create_host()));
    }
}

mod has_host_platform {
    use super::*;

    #[test]
    fn is_true_only_when_host_platform_info_holds_a_capability() {
        assert!(has_host_platform(&host_with_slot("platform", "info")));
        assert!(!has_host_platform(&host_with_every_covered_slot_except(
            "platform", "info"
        )));
        assert!(!has_host_platform(&create_host()));
    }
}

mod has_host_power_keep_awake {
    use super::*;

    #[test]
    fn is_true_only_when_host_power_keep_awake_holds_a_capability() {
        assert!(has_host_power_keep_awake(&host_with_slot(
            "power",
            "keepAwake"
        )));
        assert!(!has_host_power_keep_awake(
            &host_with_every_covered_slot_except("power", "keepAwake")
        ));
        assert!(!has_host_power_keep_awake(&create_host()));
    }
}

mod has_host_preferences {
    use super::*;

    #[test]
    fn is_true_only_when_host_preferences_local_holds_a_capability() {
        assert!(has_host_preferences(&host_with_slot(
            "preferences",
            "local"
        )));
        assert!(!has_host_preferences(&host_with_every_covered_slot_except(
            "preferences",
            "local"
        )));
        assert!(!has_host_preferences(&create_host()));
    }
}

mod has_host_preferences_persistence_query {
    use super::*;

    #[test]
    fn is_true_only_when_host_preferences_persistence_query_holds_a_capability() {
        assert!(has_host_preferences_persistence_query(&host_with_slot(
            "preferences",
            "persistenceQuery"
        )));
        assert!(!has_host_preferences_persistence_query(
            &host_with_every_covered_slot_except("preferences", "persistenceQuery")
        ));
        assert!(!has_host_preferences_persistence_query(&create_host()));
    }
}

mod has_host_screen_query {
    use super::*;

    #[test]
    fn is_true_only_when_host_screen_query_holds_a_capability() {
        assert!(has_host_screen_query(&host_with_slot("screen", "query")));
        assert!(!has_host_screen_query(
            &host_with_every_covered_slot_except("screen", "query")
        ));
        assert!(!has_host_screen_query(&create_host()));
    }
}

mod has_host_sensors {
    use super::*;

    #[test]
    fn is_true_only_when_host_sensors_query_holds_a_capability() {
        assert!(has_host_sensors(&host_with_slot("sensors", "query")));
        assert!(!has_host_sensors(&host_with_every_covered_slot_except(
            "sensors", "query"
        )));
        assert!(!has_host_sensors(&create_host()));
    }
}

mod has_host_socket {
    use super::*;

    #[test]
    fn is_true_only_when_host_socket_connection_holds_a_capability() {
        assert!(has_host_socket(&host_with_slot("socket", "connection")));
        assert!(!has_host_socket(&host_with_every_covered_slot_except(
            "socket",
            "connection"
        )));
        assert!(!has_host_socket(&create_host()));
    }
}

mod has_host_soft_keyboard_info {
    use super::*;

    #[test]
    fn is_true_only_when_host_soft_keyboard_info_holds_a_capability() {
        assert!(has_host_soft_keyboard_info(&host_with_slot(
            "softKeyboard",
            "info"
        )));
        assert!(!has_host_soft_keyboard_info(
            &host_with_every_covered_slot_except("softKeyboard", "info")
        ));
        assert!(!has_host_soft_keyboard_info(&create_host()));
    }
}

mod has_host_text_segmenter {
    use super::*;

    #[test]
    fn is_true_only_when_host_text_segment_segmenter_holds_a_capability() {
        assert!(has_host_text_segmenter(&host_with_slot(
            "textSegment",
            "segmenter"
        )));
        assert!(!has_host_text_segmenter(
            &host_with_every_covered_slot_except("textSegment", "segmenter")
        ));
        assert!(!has_host_text_segmenter(&create_host()));
    }
}

mod has_host_text_shaper {
    use super::*;

    #[test]
    fn is_true_only_when_host_text_shaper_shaper_holds_a_capability() {
        assert!(has_host_text_shaper(&host_with_slot(
            "textShaper",
            "shaper"
        )));
        assert!(!has_host_text_shaper(&host_with_every_covered_slot_except(
            "textShaper",
            "shaper"
        )));
        assert!(!has_host_text_shaper(&create_host()));
    }
}

mod has_host_video {
    use super::*;

    #[test]
    fn is_true_only_when_host_video_playback_holds_a_capability() {
        assert!(has_host_video(&host_with_slot("video", "playback")));
        assert!(!has_host_video(&host_with_every_covered_slot_except(
            "video", "playback"
        )));
        assert!(!has_host_video(&create_host()));
    }
}
