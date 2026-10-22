//! Typed accessors for the capability slots a Flight package takes as a parameter (TS `hostQuery.ts`).
//! Each is named after the capability it returns and reads exactly one group's slot; an absent slot is
//! `None`. The returned reference is the host's own capability record.

use flight_bitmap::{HostBitmapEncodeCapability, HostBitmapReadbackCapability};
use flight_clipboard::HostClipboardFormatsCapability;
use flight_device::HostDeviceCapability;
use flight_filesystem::HostFileSystemCapability;
use flight_font::{HostFontLoadingCapability, HostGlyphRasterizerCapability};
use flight_geolocation::HostGeolocationCapability;
use flight_haptics::HostHapticsCapability;
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
use flight_textsegment::HostTextSegmenterCapability;
use flight_textshaper::HostTextShaperCapability;
use flight_video::HostVideoCapability;

use flight_surface::HostWgpuCapability;

use crate::types::Host;

/// The `HostAudioDeviceCapability` held in `host.audio.device`, or `None` (TS `getHostAudioDevice`).
pub fn get_host_audio_device(host: &Host) -> Option<&HostAudioDeviceCapability> {
    return host.audio.device.as_ref();
}

/// The `HostAudioMixerCapability` held in `host.audio.mixer`, or `None` (TS `getHostAudioMixer`).
pub fn get_host_audio_mixer(host: &Host) -> Option<&HostAudioMixerCapability> {
    return host.audio.mixer.as_ref();
}

/// The `HostBitmapEncodeCapability` held in `host.bitmap.encode`, or `None` (TS `getHostBitmapEncode`).
pub fn get_host_bitmap_encode(host: &Host) -> Option<&HostBitmapEncodeCapability> {
    return host.bitmap.encode.as_ref();
}

/// The `HostBitmapReadbackCapability` held in `host.bitmap.readback`, or `None` (TS `getHostBitmapReadback`).
pub fn get_host_bitmap_readback(host: &Host) -> Option<&HostBitmapReadbackCapability> {
    return host.bitmap.readback.as_ref();
}

/// The `HostClipboardFormatsCapability` held in `host.clipboard.formats`, or `None` (TS `getHostClipboardFormats`).
pub fn get_host_clipboard_formats(host: &Host) -> Option<&HostClipboardFormatsCapability> {
    return host.clipboard.formats.as_ref();
}

/// The `HostDeviceCapability` held in `host.device.info`, or `None` (TS `getHostDevice`).
pub fn get_host_device(host: &Host) -> Option<&HostDeviceCapability> {
    return host.device.info.as_ref();
}

/// The `HostFileSystemCapability` held in `host.fileSystem.access`, or `None` (TS `getHostFileSystem`).
pub fn get_host_file_system(host: &Host) -> Option<&HostFileSystemCapability> {
    return host.file_system.access.as_ref();
}

/// The `HostFontLoadingCapability` held in `host.font.loader`, or `None` (TS `getHostFontLoading`).
pub fn get_host_font_loading(host: &Host) -> Option<&HostFontLoadingCapability> {
    return host.font.loader.as_ref();
}

/// The `HostGeolocationCapability` held in `host.geolocation.position`, or `None` (TS `getHostGeolocation`).
pub fn get_host_geolocation(host: &Host) -> Option<&HostGeolocationCapability> {
    return host.geolocation.position.as_ref();
}

/// The `HostGlyphRasterizerCapability` held in `host.glyph.rasterizer`, or `None` (TS `getHostGlyphRasterizer`).
pub fn get_host_glyph_rasterizer(host: &Host) -> Option<&HostGlyphRasterizerCapability> {
    return host.glyph.rasterizer.as_ref();
}

/// The `HostHapticsCapability` held in `host.haptics.engine`, or `None` (TS `getHostHaptics`).
pub fn get_host_haptics(host: &Host) -> Option<&HostHapticsCapability> {
    return host.haptics.engine.as_ref();
}

/// The `HostImageCapability` held in `host.image.loader`, or `None` (TS `getHostImage`).
pub fn get_host_image(host: &Host) -> Option<&HostImageCapability> {
    return host.image.loader.as_ref();
}

/// The `HostInputIngressCapability` held in `host.input.ingress`, or `None` (TS `getHostInputIngress`).
pub fn get_host_input_ingress(host: &Host) -> Option<&HostInputIngressCapability> {
    return host.input.ingress.as_ref();
}

/// The `HostLifecycleCapability` held in `host.lifecycle.state`, or `None` (TS `getHostLifecycle`).
pub fn get_host_lifecycle(host: &Host) -> Option<&HostLifecycleCapability> {
    return host.lifecycle.state.as_ref();
}

/// The `HostNetCapability` held in `host.net.http`, or `None` (TS `getHostNet`).
pub fn get_host_net(host: &Host) -> Option<&HostNetCapability> {
    return host.net.http.as_ref();
}

/// The `HostNotificationPermissionCapability` held in `host.notification.permission`, or `None` (TS `getHostNotificationPermission`).
pub fn get_host_notification_permission(
    host: &Host,
) -> Option<&HostNotificationPermissionCapability> {
    return host.notification.permission.as_ref();
}

/// The `HostPlatformCapability` held in `host.platform.info`, or `None` (TS `getHostPlatform`).
pub fn get_host_platform(host: &Host) -> Option<&HostPlatformCapability> {
    return host.platform.info.as_ref();
}

/// The `HostPowerKeepAwakeCapability` held in `host.power.keepAwake`, or `None` (TS `getHostPowerKeepAwake`).
pub fn get_host_power_keep_awake(host: &Host) -> Option<&HostPowerKeepAwakeCapability> {
    return host.power.keep_awake.as_ref();
}

/// The `HostPreferencesCapability` held in `host.preferences.local`, or `None` (TS `getHostPreferences`).
pub fn get_host_preferences(host: &Host) -> Option<&HostPreferencesCapability> {
    return host.preferences.local.as_ref();
}

/// The `HostPreferencesPersistenceQueryCapability` held in `host.preferences.persistenceQuery`, or `None` (TS `getHostPreferencesPersistenceQuery`).
pub fn get_host_preferences_persistence_query(
    host: &Host,
) -> Option<&HostPreferencesPersistenceQueryCapability> {
    return host.preferences.persistence_query.as_ref();
}

/// The `HostScreenQueryCapability` held in `host.screen.query`, or `None` (TS `getHostScreenQuery`).
pub fn get_host_screen_query(host: &Host) -> Option<&HostScreenQueryCapability> {
    return host.screen.query.as_ref();
}

/// The `HostSensorsCapability` held in `host.sensors.query`, or `None` (TS `getHostSensors`).
pub fn get_host_sensors(host: &Host) -> Option<&HostSensorsCapability> {
    return host.sensors.query.as_ref();
}

/// The `HostSocketCapability` held in `host.socket.connection`, or `None` (TS `getHostSocket`).
pub fn get_host_socket(host: &Host) -> Option<&HostSocketCapability> {
    return host.socket.connection.as_ref();
}

/// The `HostSoftKeyboardInfoCapability` held in `host.softKeyboard.info`, or `None` (TS `getHostSoftKeyboardInfo`).
pub fn get_host_soft_keyboard_info(host: &Host) -> Option<&HostSoftKeyboardInfoCapability> {
    return host.soft_keyboard.info.as_ref();
}

/// The `HostTextSegmenterCapability` held in `host.textSegment.segmenter`, or `None` (TS `getHostTextSegmenter`).
pub fn get_host_text_segmenter(host: &Host) -> Option<&HostTextSegmenterCapability> {
    return host.text_segment.segmenter.as_ref();
}

/// The `HostTextShaperCapability` held in `host.textShaper.shaper`, or `None` (TS `getHostTextShaper`).
pub fn get_host_text_shaper(host: &Host) -> Option<&HostTextShaperCapability> {
    return host.text_shaper.shaper.as_ref();
}

/// The `HostVideoCapability` held in `host.video.playback`, or `None` (TS `getHostVideo`).
pub fn get_host_video(host: &Host) -> Option<&HostVideoCapability> {
    return host.video.playback.as_ref();
}

/// The `HostWgpuCapability` held in `host.wgpu.context`, or `None` (TS `getHostWgpu`).
pub fn get_host_wgpu(host: &Host) -> Option<&HostWgpuCapability> {
    return host.wgpu.context.as_ref();
}

/// Whether `host.audio.device` holds a capability (TS `hasHostAudioDevice`).
pub fn has_host_audio_device(host: &Host) -> bool {
    return get_host_audio_device(host).is_some();
}

/// Whether `host.audio.mixer` holds a capability (TS `hasHostAudioMixer`).
pub fn has_host_audio_mixer(host: &Host) -> bool {
    return get_host_audio_mixer(host).is_some();
}

/// Whether `host.bitmap.encode` holds a capability (TS `hasHostBitmapEncode`).
pub fn has_host_bitmap_encode(host: &Host) -> bool {
    return get_host_bitmap_encode(host).is_some();
}

/// Whether `host.bitmap.readback` holds a capability (TS `hasHostBitmapReadback`).
pub fn has_host_bitmap_readback(host: &Host) -> bool {
    return get_host_bitmap_readback(host).is_some();
}

/// Whether `host.clipboard.formats` holds a capability (TS `hasHostClipboardFormats`).
pub fn has_host_clipboard_formats(host: &Host) -> bool {
    return get_host_clipboard_formats(host).is_some();
}

/// Whether `host.device.info` holds a capability (TS `hasHostDevice`).
pub fn has_host_device(host: &Host) -> bool {
    return get_host_device(host).is_some();
}

/// Whether `host.fileSystem.access` holds a capability (TS `hasHostFileSystem`).
pub fn has_host_file_system(host: &Host) -> bool {
    return get_host_file_system(host).is_some();
}

/// Whether `host.font.loader` holds a capability (TS `hasHostFontLoading`).
pub fn has_host_font_loading(host: &Host) -> bool {
    return get_host_font_loading(host).is_some();
}

/// Whether `host.geolocation.position` holds a capability (TS `hasHostGeolocation`).
pub fn has_host_geolocation(host: &Host) -> bool {
    return get_host_geolocation(host).is_some();
}

/// Whether `host.glyph.rasterizer` holds a capability (TS `hasHostGlyphRasterizer`).
pub fn has_host_glyph_rasterizer(host: &Host) -> bool {
    return get_host_glyph_rasterizer(host).is_some();
}

/// Whether `host.haptics.engine` holds a capability (TS `hasHostHaptics`).
pub fn has_host_haptics(host: &Host) -> bool {
    return get_host_haptics(host).is_some();
}

/// Whether `host.image.loader` holds a capability (TS `hasHostImage`).
pub fn has_host_image(host: &Host) -> bool {
    return get_host_image(host).is_some();
}

/// Whether `host.input.ingress` holds a capability (TS `hasHostInputIngress`).
pub fn has_host_input_ingress(host: &Host) -> bool {
    return get_host_input_ingress(host).is_some();
}

/// Whether `host.lifecycle.state` holds a capability (TS `hasHostLifecycle`).
pub fn has_host_lifecycle(host: &Host) -> bool {
    return get_host_lifecycle(host).is_some();
}

/// Whether `host.net.http` holds a capability (TS `hasHostNet`).
pub fn has_host_net(host: &Host) -> bool {
    return get_host_net(host).is_some();
}

/// Whether `host.notification.permission` holds a capability (TS `hasHostNotificationPermission`).
pub fn has_host_notification_permission(host: &Host) -> bool {
    return get_host_notification_permission(host).is_some();
}

/// Whether `host.platform.info` holds a capability (TS `hasHostPlatform`).
pub fn has_host_platform(host: &Host) -> bool {
    return get_host_platform(host).is_some();
}

/// Whether `host.power.keepAwake` holds a capability (TS `hasHostPowerKeepAwake`).
pub fn has_host_power_keep_awake(host: &Host) -> bool {
    return get_host_power_keep_awake(host).is_some();
}

/// Whether `host.preferences.local` holds a capability (TS `hasHostPreferences`).
pub fn has_host_preferences(host: &Host) -> bool {
    return get_host_preferences(host).is_some();
}

/// Whether `host.preferences.persistenceQuery` holds a capability (TS `hasHostPreferencesPersistenceQuery`).
pub fn has_host_preferences_persistence_query(host: &Host) -> bool {
    return get_host_preferences_persistence_query(host).is_some();
}

/// Whether `host.screen.query` holds a capability (TS `hasHostScreenQuery`).
pub fn has_host_screen_query(host: &Host) -> bool {
    return get_host_screen_query(host).is_some();
}

/// Whether `host.sensors.query` holds a capability (TS `hasHostSensors`).
pub fn has_host_sensors(host: &Host) -> bool {
    return get_host_sensors(host).is_some();
}

/// Whether `host.socket.connection` holds a capability (TS `hasHostSocket`).
pub fn has_host_socket(host: &Host) -> bool {
    return get_host_socket(host).is_some();
}

/// Whether `host.softKeyboard.info` holds a capability (TS `hasHostSoftKeyboardInfo`).
pub fn has_host_soft_keyboard_info(host: &Host) -> bool {
    return get_host_soft_keyboard_info(host).is_some();
}

/// Whether `host.textSegment.segmenter` holds a capability (TS `hasHostTextSegmenter`).
pub fn has_host_text_segmenter(host: &Host) -> bool {
    return get_host_text_segmenter(host).is_some();
}

/// Whether `host.textShaper.shaper` holds a capability (TS `hasHostTextShaper`).
pub fn has_host_text_shaper(host: &Host) -> bool {
    return get_host_text_shaper(host).is_some();
}

/// Whether `host.video.playback` holds a capability (TS `hasHostVideo`).
pub fn has_host_video(host: &Host) -> bool {
    return get_host_video(host).is_some();
}

/// Whether `host.wgpu.context` holds a capability (TS `hasHostWgpu`).
pub fn has_host_wgpu(host: &Host) -> bool {
    return get_host_wgpu(host).is_some();
}
