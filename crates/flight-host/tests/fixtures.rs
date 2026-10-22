// Capability stand-ins for host tests. Every callback is unreachable: these tests read only whether a
// slot is filled, never call through it. Each record is built field by field, as no capability
// record has a Default (an empty capability would be a provider that answers nothing).

use std::sync::Arc;

use flight_app::HostWindowGeometryCapability;
use flight_app::HostWindowLifecycleCapability;
use flight_audio::HostAudioCodecCapability;
use flight_bitmap::{HostBitmapEncodeCapability, HostBitmapReadbackCapability};
use flight_clipboard::HostClipboardFormatsCapability;
use flight_device::HostDeviceCapability;
use flight_filesystem::HostFileSystemCapability;
use flight_font::{HostFontLoadingCapability, HostGlyphRasterizerCapability};
use flight_geolocation::HostGeolocationCapability;
use flight_haptics::HostHapticsCapability;
use flight_host::contract::Host;
use flight_image::HostImageCapability;
use flight_input::HostInputIngressCapability;
use flight_keyboard::HostSoftKeyboardInfoCapability;
use flight_lifecycle::HostLifecycleCapability;
use flight_media::{HostAudioDeviceCapability, HostAudioMixerCapability};
use flight_net::HostNetCapability;
use flight_notification::HostNotificationPermissionCapability;
use flight_permissions::HostPreferencesPersistenceQueryCapability;
use flight_platform::HostPlatformCapability;
use flight_power::HostPowerKeepAwakeCapability;
use flight_preferences::HostPreferencesCapability;
use flight_screen::HostScreenQueryCapability;
use flight_sensors::HostSensorsCapability;
use flight_socket::HostSocketCapability;
use flight_surface::HostWgpuCapability;
use flight_textsegment::HostTextSegmenterCapability;
use flight_textshaper::HostTextShaperCapability;
use flight_video::HostVideoCapability;

/// Fills `host.<group>.<slot>` (source names) with a stand-in capability; panics on a slot no
/// accessor covers.
pub fn fill_slot(host: &mut Host, group: &str, slot: &str) {
    match (group, slot) {
        ("audio", "device") => host.audio.device = Some(fixture_host_audio_device_capability()),
        ("audio", "mixer") => host.audio.mixer = Some(fixture_host_audio_mixer_capability()),
        ("bitmap", "encode") => host.bitmap.encode = Some(fixture_host_bitmap_encode_capability()),
        ("bitmap", "readback") => {
            host.bitmap.readback = Some(fixture_host_bitmap_readback_capability())
        }
        ("clipboard", "formats") => {
            host.clipboard.formats = Some(fixture_host_clipboard_formats_capability())
        }
        ("device", "info") => host.device.info = Some(fixture_host_device_capability()),
        ("fileSystem", "access") => {
            host.file_system.access = Some(fixture_host_file_system_capability())
        }
        ("font", "loader") => host.font.loader = Some(fixture_host_font_loading_capability()),
        ("geolocation", "position") => {
            host.geolocation.position = Some(fixture_host_geolocation_capability())
        }
        ("glyph", "rasterizer") => {
            host.glyph.rasterizer = Some(fixture_host_glyph_rasterizer_capability())
        }
        ("haptics", "engine") => host.haptics.engine = Some(fixture_host_haptics_capability()),
        ("image", "loader") => host.image.loader = Some(fixture_host_image_capability()),
        ("input", "ingress") => host.input.ingress = Some(fixture_host_input_ingress_capability()),
        ("lifecycle", "state") => host.lifecycle.state = Some(fixture_host_lifecycle_capability()),
        ("net", "http") => host.net.http = Some(fixture_host_net_capability()),
        ("notification", "permission") => {
            host.notification.permission = Some(fixture_host_notification_permission_capability())
        }
        ("platform", "info") => host.platform.info = Some(fixture_host_platform_capability()),
        ("power", "keepAwake") => {
            host.power.keep_awake = Some(fixture_host_power_keep_awake_capability())
        }
        ("preferences", "local") => {
            host.preferences.local = Some(fixture_host_preferences_capability())
        }
        ("preferences", "persistenceQuery") => {
            host.preferences.persistence_query =
                Some(fixture_host_preferences_persistence_query_capability())
        }
        ("screen", "query") => host.screen.query = Some(fixture_host_screen_query_capability()),
        ("sensors", "query") => host.sensors.query = Some(fixture_host_sensors_capability()),
        ("socket", "connection") => host.socket.connection = Some(fixture_host_socket_capability()),
        ("softKeyboard", "info") => {
            host.soft_keyboard.info = Some(fixture_host_soft_keyboard_info_capability())
        }
        ("textSegment", "segmenter") => {
            host.text_segment.segmenter = Some(fixture_host_text_segmenter_capability())
        }
        ("textShaper", "shaper") => {
            host.text_shaper.shaper = Some(fixture_host_text_shaper_capability())
        }
        ("video", "playback") => host.video.playback = Some(fixture_host_video_capability()),
        ("wgpu", "context") => host.wgpu.context = Some(fixture_host_wgpu_capability()),
        _ => panic!("no covered slot {}.{}", group, slot),
    }
}

pub fn fixture_host_audio_device_capability() -> HostAudioDeviceCapability {
    return HostAudioDeviceCapability {
        provider: Arc::new(()),
        create_buffer: Arc::new(|_, _, _, _, _| unreachable!("fixture")),
        create_device: Arc::new(|_| unreachable!("fixture")),
        create_source: Arc::new(|_, _| unreachable!("fixture")),
        destroy_buffer: Arc::new(|_| unreachable!("fixture")),
        destroy_device: Arc::new(|_| unreachable!("fixture")),
        destroy_source: Arc::new(|_| unreachable!("fixture")),
        fade_source_gain: None,
        get_device_time: Arc::new(|_| unreachable!("fixture")),
        on_source_ended: Arc::new(|_, _| unreachable!("fixture")),
        resume_device: Arc::new(|_| unreachable!("fixture")),
        set_source_gain: Arc::new(|_, _| unreachable!("fixture")),
        set_source_pan: Arc::new(|_, _| unreachable!("fixture")),
        set_source_playback_rate: Arc::new(|_, _| unreachable!("fixture")),
        start_source: Arc::new(|_, _, _| unreachable!("fixture")),
        stop_source: Arc::new(|_| unreachable!("fixture")),
    };
}

pub fn fixture_host_audio_mixer_capability() -> HostAudioMixerCapability {
    return HostAudioMixerCapability {
        provider: Arc::new(()),
        create_mixer_graph: Arc::new(|_, _| unreachable!("fixture")),
        destroy_mixer_graph: Arc::new(|_| unreachable!("fixture")),
        create_bus_node: Arc::new(|_, _, _| unreachable!("fixture")),
        destroy_bus_node: Arc::new(|_, _| unreachable!("fixture")),
        set_bus_node_gain: Arc::new(|_, _, _| unreachable!("fixture")),
        set_bus_node_pan: Arc::new(|_, _, _| unreachable!("fixture")),
        fade_bus_node_gain: Arc::new(|_, _, _, _| unreachable!("fixture")),
        set_master_gain: Arc::new(|_, _| unreachable!("fixture")),
        route_source_to_bus: Arc::new(|_, _, _| unreachable!("fixture")),
        unroute_source: Arc::new(|_, _| unreachable!("fixture")),
        route_source_to_default: Arc::new(|_, _| unreachable!("fixture")),
    };
}

pub fn fixture_host_bitmap_encode_capability() -> HostBitmapEncodeCapability {
    return HostBitmapEncodeCapability {
        provider: Arc::new(()),
        encode_bitmap: Arc::new(|_, _, _| unreachable!("fixture")),
        supported_formats: Vec::new(),
    };
}

pub fn fixture_host_bitmap_readback_capability() -> HostBitmapReadbackCapability {
    return HostBitmapReadbackCapability {
        provider: Arc::new(()),
        read_bitmap: Arc::new(|_, _, _, _| unreachable!("fixture")),
    };
}

pub fn fixture_host_clipboard_formats_capability() -> HostClipboardFormatsCapability {
    return HostClipboardFormatsCapability {
        get_formats: Arc::new(|| unreachable!("fixture")),
        has_format: Arc::new(|_| unreachable!("fixture")),
        read_format: Arc::new(|_| unreachable!("fixture")),
        read_html: Arc::new(|| unreachable!("fixture")),
        read_items: Arc::new(|_| unreachable!("fixture")),
        read_rtf: Arc::new(|| unreachable!("fixture")),
        write_format: Arc::new(|_, _| unreachable!("fixture")),
        write_html: Arc::new(|_| unreachable!("fixture")),
        write_items: Arc::new(|_| unreachable!("fixture")),
        write_rtf: Arc::new(|_| unreachable!("fixture")),
    };
}

pub fn fixture_host_device_capability() -> HostDeviceCapability {
    return HostDeviceCapability {
        provider: Arc::new(()),
        get_capabilities: Arc::new(|_| unreachable!("fixture")),
        get_display_metrics: Arc::new(|_| unreachable!("fixture")),
        get_id: Arc::new(|| unreachable!("fixture")),
        get_info: Arc::new(|_| unreachable!("fixture")),
        get_safe_area_insets: Arc::new(|_| unreachable!("fixture")),
        refresh: None,
    };
}

pub fn fixture_host_file_system_capability() -> HostFileSystemCapability {
    return HostFileSystemCapability {
        provider: Arc::new(()),
        append_text_file: None,
        can_access_file: None,
        copy: None,
        directory_exists: None,
        file_exists: None,
        get_file_system_usage: None,
        make_directory: None,
        open_file_read_stream: None,
        open_file_write_stream: None,
        read_binary_file: None,
        read_binary_file_range: None,
        read_directory: None,
        read_directory_recursive: None,
        read_text_file: None,
        remove_directory: None,
        remove_file: None,
        rename: None,
        stat_file: None,
        write_binary_file: None,
        write_file_atomic: None,
        write_text_file: None,
    };
}

pub fn fixture_host_font_loading_capability() -> HostFontLoadingCapability {
    return HostFontLoadingCapability {
        add_font_face: Arc::new(|_| unreachable!("fixture")),
        check_font_face: Arc::new(|_| unreachable!("fixture")),
        create_font_face: Arc::new(|_, _| unreachable!("fixture")),
        load_font_face: Arc::new(|_| unreachable!("fixture")),
        load_font_faces: Arc::new(|_| unreachable!("fixture")),
        provider: Arc::new(()),
        when_ready: Arc::new(|| unreachable!("fixture")),
    };
}

pub fn fixture_host_geolocation_capability() -> HostGeolocationCapability {
    return HostGeolocationCapability {
        clear_watch: Arc::new(|_| unreachable!("fixture")),
        get_current_position: Arc::new(|_| unreachable!("fixture")),
        get_current_position_result: Arc::new(|_| unreachable!("fixture")),
        is_available: Arc::new(|| unreachable!("fixture")),
        watch_position: Arc::new(|_, _, _| unreachable!("fixture")),
        prompt_for_access: None,
    };
}

pub fn fixture_host_glyph_rasterizer_capability() -> HostGlyphRasterizerCapability {
    return HostGlyphRasterizerCapability {
        measure_metrics: None,
        provider: Arc::new(()),
        rasterize: Arc::new(|_, _| unreachable!("fixture")),
    };
}

pub fn fixture_host_haptics_capability() -> HostHapticsCapability {
    return HostHapticsCapability {
        cancel: Arc::new(|| unreachable!("fixture")),
        capabilities: Arc::new(|_| unreachable!("fixture")),
        impact: Arc::new(|_, _| unreachable!("fixture")),
        is_supported: Arc::new(|| unreachable!("fixture")),
        notification: Arc::new(|_| unreachable!("fixture")),
        prepare: None,
        selection: Arc::new(|| unreachable!("fixture")),
        vibrate: Arc::new(|_| unreachable!("fixture")),
        vibrate_pattern: Arc::new(|_| unreachable!("fixture")),
        vibrate_waveform: None,
    };
}

pub fn fixture_host_image_capability() -> HostImageCapability {
    return HostImageCapability {
        create_image_from_bitmap: None,
        create_image_from_surface: None,
        load_image_from_url: Arc::new(|_, _, _| unreachable!("fixture")),
        provider: Arc::new(()),
    };
}

pub fn fixture_host_input_ingress_capability() -> HostInputIngressCapability {
    return HostInputIngressCapability {
        provider: Arc::new(()),
        attach_gamepad: Arc::new(|_, _, _| unreachable!("fixture")),
        attach_keyboard: Arc::new(|_, _, _| unreachable!("fixture")),
        attach_pointer: Arc::new(|_, _, _| unreachable!("fixture")),
        attach_relative_pointer: Arc::new(|_, _, _| unreachable!("fixture")),
        attach_text: Arc::new(|_, _, _| unreachable!("fixture")),
        attach_wheel: Arc::new(|_, _, _| unreachable!("fixture")),
    };
}

pub fn fixture_host_lifecycle_capability() -> HostLifecycleCapability {
    return HostLifecycleCapability {
        get_state: Arc::new(|| unreachable!("fixture")),
        subscribe: Arc::new(|_| unreachable!("fixture")),
        get_launch_kind: None,
        subscribe_memory_warning: None,
    };
}

pub fn fixture_host_net_capability() -> HostNetCapability {
    return HostNetCapability {
        provider: Arc::new(()),
        send_net_request: Arc::new(|_, _| unreachable!("fixture")),
    };
}

pub fn fixture_host_notification_permission_capability() -> HostNotificationPermissionCapability {
    return HostNotificationPermissionCapability {
        get_permission: Arc::new(|| unreachable!("fixture")),
        request_permission: Arc::new(|| unreachable!("fixture")),
        provider: Arc::new(()),
    };
}

pub fn fixture_host_platform_capability() -> HostPlatformCapability {
    return HostPlatformCapability {
        provider: Arc::new(()),
        get_info: Arc::new(|_| unreachable!("fixture")),
    };
}

pub fn fixture_host_power_keep_awake_capability() -> HostPowerKeepAwakeCapability {
    return HostPowerKeepAwakeCapability {
        acquire: Arc::new(|_| unreachable!("fixture")),
        destroy: None,
        is_active: Arc::new(|| unreachable!("fixture")),
        provider: Arc::new(()),
        release: Arc::new(|| unreachable!("fixture")),
    };
}

pub fn fixture_host_preferences_capability() -> HostPreferencesCapability {
    return HostPreferencesCapability {
        clear: Arc::new(|| unreachable!("fixture")),
        get_item: Arc::new(|_| unreachable!("fixture")),
        keys: Arc::new(|| unreachable!("fixture")),
        provider: Arc::new(()),
        remove_item: Arc::new(|_| unreachable!("fixture")),
        set_item: Arc::new(|_, _| unreachable!("fixture")),
    };
}

pub fn fixture_host_preferences_persistence_query_capability()
-> HostPreferencesPersistenceQueryCapability {
    return HostPreferencesPersistenceQueryCapability {
        get_persistence: Arc::new(|| unreachable!("fixture")),
        provider: Arc::new(()),
    };
}

pub fn fixture_host_screen_query_capability() -> HostScreenQueryCapability {
    return HostScreenQueryCapability {
        provider: Arc::new(()),
        destroy: None,
        get_screens: Arc::new(|_| unreachable!("fixture")),
        get_primary_screen: Arc::new(|_| unreachable!("fixture")),
        get_cursor_position: Arc::new(|_| unreachable!("fixture")),
    };
}

pub fn fixture_host_sensors_capability() -> HostSensorsCapability {
    return HostSensorsCapability {
        get_permission_state: Arc::new(|_| unreachable!("fixture")),
        is_ambient_light_supported: Arc::new(|| unreachable!("fixture")),
        is_barometer_supported: Arc::new(|| unreachable!("fixture")),
        is_gravity_supported: Arc::new(|| unreachable!("fixture")),
        is_gyroscope_supported: Arc::new(|| unreachable!("fixture")),
        is_linear_acceleration_supported: Arc::new(|| unreachable!("fixture")),
        is_magnetometer_supported: Arc::new(|| unreachable!("fixture")),
        is_motion_supported: Arc::new(|| unreachable!("fixture")),
        is_orientation_supported: Arc::new(|| unreachable!("fixture")),
        is_proximity_supported: Arc::new(|| unreachable!("fixture")),
        provider: Arc::new(()),
        request_permission: Arc::new(|| unreachable!("fixture")),
        subscribe_absolute_orientation: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_ambient_light: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_barometer: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_gravity: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_linear_acceleration: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_magnetometer: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_motion: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_orientation: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_proximity: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_quaternion: Arc::new(|_, _| unreachable!("fixture")),
    };
}

pub fn fixture_host_socket_capability() -> HostSocketCapability {
    return HostSocketCapability {
        provider: Arc::new(()),
        open_socket: Arc::new(|_, _| unreachable!("fixture")),
        open_tcp_socket: None,
    };
}

pub fn fixture_host_soft_keyboard_info_capability() -> HostSoftKeyboardInfoCapability {
    return HostSoftKeyboardInfoCapability {
        get_info: Arc::new(|_| unreachable!("fixture")),
    };
}

pub fn fixture_host_text_segmenter_capability() -> HostTextSegmenterCapability {
    return HostTextSegmenterCapability {
        segment: |_, _, _| unreachable!("fixture"),
    };
}

pub fn fixture_host_text_shaper_capability() -> HostTextShaperCapability {
    return HostTextShaperCapability {
        provider: Arc::new(()),
        get_code_point_for_glyph: None,
        get_font_metrics: None,
        get_glyph_extents: None,
        get_glyph_index_for_code_point: None,
        get_glyph_name: None,
        measure_text: Arc::new(|_, _| unreachable!("fixture")),
        shape_run: None,
    };
}

pub fn fixture_host_video_capability() -> HostVideoCapability {
    return HostVideoCapability {
        provider: Arc::new(()),
        add_ended_listener: None,
        attach_stream: None,
        can_play_type: Arc::new(|_| unreachable!("fixture")),
        create_object_url: None,
        create_video_element: None,
        get_current_time: None,
        get_duration: None,
        get_height: None,
        get_loop: None,
        get_muted: None,
        get_playback_rate: None,
        get_volume: None,
        get_width: None,
        is_ready: None,
        load_url: None,
        pause: None,
        play: None,
        release_element: None,
        remove_ended_listener: None,
        revoke_object_url: None,
        set_current_time: None,
        set_loop: None,
        set_muted: None,
        set_playback_rate: None,
        set_volume: None,
    };
}

pub fn fixture_host_audio_codec_capability() -> HostAudioCodecCapability {
    return HostAudioCodecCapability {
        can_play_type: Arc::new(|_| unreachable!("fixture")),
        provider: Arc::new(()),
    };
}

pub fn fixture_host_window_geometry_capability() -> HostWindowGeometryCapability {
    return HostWindowGeometryCapability {
        provider: Arc::new(()),
        center: None,
        get_bounds: Arc::new(|_, _| unreachable!("fixture")),
        set_position: Arc::new(|_, _, _| unreachable!("fixture")),
        set_size: Arc::new(|_, _, _| unreachable!("fixture")),
        subscribe_move: None,
        subscribe_resize: None,
    };
}

pub fn fixture_host_window_lifecycle_capability() -> HostWindowLifecycleCapability {
    return HostWindowLifecycleCapability {
        provider: Arc::new(()),
        close: Arc::new(|_| unreachable!("fixture")),
        open: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_close: None,
    };
}

pub fn fixture_host_wgpu_capability() -> HostWgpuCapability {
    return HostWgpuCapability {
        provider: Arc::new(()),
        acquire: Arc::new(|_, _| unreachable!("fixture")),
        attach_surface: Arc::new(|_, _| unreachable!("fixture")),
        create: Arc::new(|_, _, _| unreachable!("fixture")),
        is_supported: Arc::new(|| unreachable!("fixture")),
        release: Arc::new(|_| unreachable!("fixture")),
    };
}
