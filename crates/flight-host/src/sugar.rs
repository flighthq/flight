//! Rust convenience methods for the public host lane (D18): each delegates to its free function.

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
use flight_surface::HostWgpuCapability;
use flight_textsegment::HostTextSegmenterCapability;
use flight_textshaper::HostTextShaperCapability;
use flight_video::HostVideoCapability;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn host_audio_device_matches_get_host_audio_device() {
        let host = create_host();
        assert_eq!(
            host.audio_device().is_some(),
            get_host_audio_device(&host).is_some()
        );
        assert_eq!(host.has_audio_device(), has_host_audio_device(&host));
    }

    #[test]
    fn host_audio_mixer_matches_get_host_audio_mixer() {
        let host = create_host();
        assert_eq!(
            host.audio_mixer().is_some(),
            get_host_audio_mixer(&host).is_some()
        );
        assert_eq!(host.has_audio_mixer(), has_host_audio_mixer(&host));
    }

    #[test]
    fn host_bitmap_encode_matches_get_host_bitmap_encode() {
        let host = create_host();
        assert_eq!(
            host.bitmap_encode().is_some(),
            get_host_bitmap_encode(&host).is_some()
        );
        assert_eq!(host.has_bitmap_encode(), has_host_bitmap_encode(&host));
    }

    #[test]
    fn host_bitmap_readback_matches_get_host_bitmap_readback() {
        let host = create_host();
        assert_eq!(
            host.bitmap_readback().is_some(),
            get_host_bitmap_readback(&host).is_some()
        );
        assert_eq!(host.has_bitmap_readback(), has_host_bitmap_readback(&host));
    }

    #[test]
    fn host_clipboard_formats_matches_get_host_clipboard_formats() {
        let host = create_host();
        assert_eq!(
            host.clipboard_formats().is_some(),
            get_host_clipboard_formats(&host).is_some()
        );
        assert_eq!(
            host.has_clipboard_formats(),
            has_host_clipboard_formats(&host)
        );
    }

    #[test]
    fn host_device_matches_get_host_device() {
        let host = create_host();
        assert_eq!(host.device().is_some(), get_host_device(&host).is_some());
        assert_eq!(host.has_device(), has_host_device(&host));
    }

    #[test]
    fn host_explain_audio_device_matches_explain_host_audio_device() {
        let host = create_host();
        assert_eq!(
            host.explain_audio_device(),
            explain_host_audio_device(&host)
        );
    }

    #[test]
    fn host_explain_audio_mixer_matches_explain_host_audio_mixer() {
        let host = create_host();
        assert_eq!(host.explain_audio_mixer(), explain_host_audio_mixer(&host));
    }

    #[test]
    fn host_explain_image_matches_explain_host_image() {
        let host = create_host();
        assert_eq!(host.explain_image(), explain_host_image(&host));
    }

    #[test]
    fn host_explain_input_ingress_matches_explain_host_input_ingress() {
        let host = create_host();
        assert_eq!(
            host.explain_input_ingress(),
            explain_host_input_ingress(&host)
        );
    }

    #[test]
    fn host_explain_matches_explain_host() {
        let host = create_host();
        assert_eq!(host.explain(), explain_host(&host));
    }

    #[test]
    fn host_explain_text_segmenter_matches_explain_host_text_segmenter() {
        let host = create_host();
        assert_eq!(
            host.explain_text_segmenter(),
            explain_host_text_segmenter(&host)
        );
    }

    #[test]
    fn host_explain_text_shaper_matches_explain_host_text_shaper() {
        let host = create_host();
        assert_eq!(host.explain_text_shaper(), explain_host_text_shaper(&host));
    }

    #[test]
    fn host_explain_video_matches_explain_host_video() {
        let host = create_host();
        assert_eq!(host.explain_video(), explain_host_video(&host));
    }

    #[test]
    fn host_file_system_matches_get_host_file_system() {
        let host = create_host();
        assert_eq!(
            host.file_system().is_some(),
            get_host_file_system(&host).is_some()
        );
        assert_eq!(host.has_file_system(), has_host_file_system(&host));
    }

    #[test]
    fn host_font_loading_matches_get_host_font_loading() {
        let host = create_host();
        assert_eq!(
            host.font_loading().is_some(),
            get_host_font_loading(&host).is_some()
        );
        assert_eq!(host.has_font_loading(), has_host_font_loading(&host));
    }

    #[test]
    fn host_geolocation_matches_get_host_geolocation() {
        let host = create_host();
        assert_eq!(
            host.geolocation().is_some(),
            get_host_geolocation(&host).is_some()
        );
        assert_eq!(host.has_geolocation(), has_host_geolocation(&host));
    }

    #[test]
    fn host_glyph_rasterizer_matches_get_host_glyph_rasterizer() {
        let host = create_host();
        assert_eq!(
            host.glyph_rasterizer().is_some(),
            get_host_glyph_rasterizer(&host).is_some()
        );
        assert_eq!(
            host.has_glyph_rasterizer(),
            has_host_glyph_rasterizer(&host)
        );
    }

    #[test]
    fn host_haptics_matches_get_host_haptics() {
        let host = create_host();
        assert_eq!(host.haptics().is_some(), get_host_haptics(&host).is_some());
        assert_eq!(host.has_haptics(), has_host_haptics(&host));
    }

    #[test]
    fn host_image_matches_get_host_image() {
        let host = create_host();
        assert_eq!(host.image().is_some(), get_host_image(&host).is_some());
        assert_eq!(host.has_image(), has_host_image(&host));
    }

    #[test]
    fn host_input_ingress_matches_get_host_input_ingress() {
        let host = create_host();
        assert_eq!(
            host.input_ingress().is_some(),
            get_host_input_ingress(&host).is_some()
        );
        assert_eq!(host.has_input_ingress(), has_host_input_ingress(&host));
    }

    #[test]
    fn host_lifecycle_matches_get_host_lifecycle() {
        let host = create_host();
        assert_eq!(
            host.lifecycle().is_some(),
            get_host_lifecycle(&host).is_some()
        );
        assert_eq!(host.has_lifecycle(), has_host_lifecycle(&host));
    }

    #[test]
    fn host_net_matches_get_host_net() {
        let host = create_host();
        assert_eq!(host.net().is_some(), get_host_net(&host).is_some());
        assert_eq!(host.has_net(), has_host_net(&host));
    }

    #[test]
    fn host_new_matches_create_host() {
        assert_eq!(Host::new().explain(), create_host().explain());
    }

    #[test]
    fn host_notification_permission_matches_get_host_notification_permission() {
        let host = create_host();
        assert_eq!(
            host.notification_permission().is_some(),
            get_host_notification_permission(&host).is_some()
        );
        assert_eq!(
            host.has_notification_permission(),
            has_host_notification_permission(&host)
        );
    }

    #[test]
    fn host_platform_matches_get_host_platform() {
        let host = create_host();
        assert_eq!(
            host.platform().is_some(),
            get_host_platform(&host).is_some()
        );
        assert_eq!(host.has_platform(), has_host_platform(&host));
    }

    #[test]
    fn host_power_keep_awake_matches_get_host_power_keep_awake() {
        let host = create_host();
        assert_eq!(
            host.power_keep_awake().is_some(),
            get_host_power_keep_awake(&host).is_some()
        );
        assert_eq!(
            host.has_power_keep_awake(),
            has_host_power_keep_awake(&host)
        );
    }

    #[test]
    fn host_preferences_matches_get_host_preferences() {
        let host = create_host();
        assert_eq!(
            host.preferences().is_some(),
            get_host_preferences(&host).is_some()
        );
        assert_eq!(host.has_preferences(), has_host_preferences(&host));
    }

    #[test]
    fn host_preferences_persistence_query_matches_get_host_preferences_persistence_query() {
        let host = create_host();
        assert_eq!(
            host.preferences_persistence_query().is_some(),
            get_host_preferences_persistence_query(&host).is_some()
        );
        assert_eq!(
            host.has_preferences_persistence_query(),
            has_host_preferences_persistence_query(&host)
        );
    }

    #[test]
    fn host_screen_query_matches_get_host_screen_query() {
        let host = create_host();
        assert_eq!(
            host.screen_query().is_some(),
            get_host_screen_query(&host).is_some()
        );
        assert_eq!(host.has_screen_query(), has_host_screen_query(&host));
    }

    #[test]
    fn host_sensors_matches_get_host_sensors() {
        let host = create_host();
        assert_eq!(host.sensors().is_some(), get_host_sensors(&host).is_some());
        assert_eq!(host.has_sensors(), has_host_sensors(&host));
    }

    #[test]
    fn host_socket_matches_get_host_socket() {
        let host = create_host();
        assert_eq!(host.socket().is_some(), get_host_socket(&host).is_some());
        assert_eq!(host.has_socket(), has_host_socket(&host));
    }

    #[test]
    fn host_soft_keyboard_info_matches_get_host_soft_keyboard_info() {
        let host = create_host();
        assert_eq!(
            host.soft_keyboard_info().is_some(),
            get_host_soft_keyboard_info(&host).is_some()
        );
        assert_eq!(
            host.has_soft_keyboard_info(),
            has_host_soft_keyboard_info(&host)
        );
    }

    #[test]
    fn host_text_segmenter_matches_get_host_text_segmenter() {
        let host = create_host();
        assert_eq!(
            host.text_segmenter().is_some(),
            get_host_text_segmenter(&host).is_some()
        );
        assert_eq!(host.has_text_segmenter(), has_host_text_segmenter(&host));
    }

    #[test]
    fn host_text_shaper_matches_get_host_text_shaper() {
        let host = create_host();
        assert_eq!(
            host.text_shaper().is_some(),
            get_host_text_shaper(&host).is_some()
        );
        assert_eq!(host.has_text_shaper(), has_host_text_shaper(&host));
    }

    #[test]
    fn host_video_matches_get_host_video() {
        let host = create_host();
        assert_eq!(host.video().is_some(), get_host_video(&host).is_some());
        assert_eq!(host.has_video(), has_host_video(&host));
    }

    #[test]
    fn host_wgpu_matches_get_host_wgpu() {
        let host = create_host();
        assert_eq!(host.wgpu().is_some(), get_host_wgpu(&host).is_some());
        assert_eq!(host.has_wgpu(), has_host_wgpu(&host));
    }
}

impl Host {
    pub fn new() -> Host {
        return create_host();
    }

    pub fn audio_device(&self) -> Option<&HostAudioDeviceCapability> {
        return get_host_audio_device(self);
    }

    pub fn audio_mixer(&self) -> Option<&HostAudioMixerCapability> {
        return get_host_audio_mixer(self);
    }

    pub fn bitmap_encode(&self) -> Option<&HostBitmapEncodeCapability> {
        return get_host_bitmap_encode(self);
    }

    pub fn bitmap_readback(&self) -> Option<&HostBitmapReadbackCapability> {
        return get_host_bitmap_readback(self);
    }

    pub fn clipboard_formats(&self) -> Option<&HostClipboardFormatsCapability> {
        return get_host_clipboard_formats(self);
    }

    pub fn device(&self) -> Option<&HostDeviceCapability> {
        return get_host_device(self);
    }

    pub fn explain(&self) -> HostExplanation {
        return explain_host(self);
    }

    pub fn explain_audio_device(&self) -> HostCapabilityExplanation {
        return explain_host_audio_device(self);
    }

    pub fn explain_audio_mixer(&self) -> HostCapabilityExplanation {
        return explain_host_audio_mixer(self);
    }

    pub fn explain_image(&self) -> HostCapabilityExplanation {
        return explain_host_image(self);
    }

    pub fn explain_input_ingress(&self) -> HostCapabilityExplanation {
        return explain_host_input_ingress(self);
    }

    pub fn explain_text_segmenter(&self) -> HostCapabilityExplanation {
        return explain_host_text_segmenter(self);
    }

    pub fn explain_text_shaper(&self) -> HostCapabilityExplanation {
        return explain_host_text_shaper(self);
    }

    pub fn explain_video(&self) -> HostCapabilityExplanation {
        return explain_host_video(self);
    }

    pub fn file_system(&self) -> Option<&HostFileSystemCapability> {
        return get_host_file_system(self);
    }

    pub fn font_loading(&self) -> Option<&HostFontLoadingCapability> {
        return get_host_font_loading(self);
    }

    pub fn geolocation(&self) -> Option<&HostGeolocationCapability> {
        return get_host_geolocation(self);
    }

    pub fn glyph_rasterizer(&self) -> Option<&HostGlyphRasterizerCapability> {
        return get_host_glyph_rasterizer(self);
    }

    pub fn haptics(&self) -> Option<&HostHapticsCapability> {
        return get_host_haptics(self);
    }

    pub fn has_audio_device(&self) -> bool {
        return has_host_audio_device(self);
    }

    pub fn has_audio_mixer(&self) -> bool {
        return has_host_audio_mixer(self);
    }

    pub fn has_bitmap_encode(&self) -> bool {
        return has_host_bitmap_encode(self);
    }

    pub fn has_bitmap_readback(&self) -> bool {
        return has_host_bitmap_readback(self);
    }

    pub fn has_clipboard_formats(&self) -> bool {
        return has_host_clipboard_formats(self);
    }

    pub fn has_device(&self) -> bool {
        return has_host_device(self);
    }

    pub fn has_file_system(&self) -> bool {
        return has_host_file_system(self);
    }

    pub fn has_font_loading(&self) -> bool {
        return has_host_font_loading(self);
    }

    pub fn has_geolocation(&self) -> bool {
        return has_host_geolocation(self);
    }

    pub fn has_glyph_rasterizer(&self) -> bool {
        return has_host_glyph_rasterizer(self);
    }

    pub fn has_haptics(&self) -> bool {
        return has_host_haptics(self);
    }

    pub fn has_image(&self) -> bool {
        return has_host_image(self);
    }

    pub fn has_input_ingress(&self) -> bool {
        return has_host_input_ingress(self);
    }

    pub fn has_lifecycle(&self) -> bool {
        return has_host_lifecycle(self);
    }

    pub fn has_net(&self) -> bool {
        return has_host_net(self);
    }

    pub fn has_notification_permission(&self) -> bool {
        return has_host_notification_permission(self);
    }

    pub fn has_platform(&self) -> bool {
        return has_host_platform(self);
    }

    pub fn has_power_keep_awake(&self) -> bool {
        return has_host_power_keep_awake(self);
    }

    pub fn has_preferences(&self) -> bool {
        return has_host_preferences(self);
    }

    pub fn has_preferences_persistence_query(&self) -> bool {
        return has_host_preferences_persistence_query(self);
    }

    pub fn has_screen_query(&self) -> bool {
        return has_host_screen_query(self);
    }

    pub fn has_sensors(&self) -> bool {
        return has_host_sensors(self);
    }

    pub fn has_socket(&self) -> bool {
        return has_host_socket(self);
    }

    pub fn has_soft_keyboard_info(&self) -> bool {
        return has_host_soft_keyboard_info(self);
    }

    pub fn has_text_segmenter(&self) -> bool {
        return has_host_text_segmenter(self);
    }

    pub fn has_text_shaper(&self) -> bool {
        return has_host_text_shaper(self);
    }

    pub fn has_video(&self) -> bool {
        return has_host_video(self);
    }

    pub fn has_wgpu(&self) -> bool {
        return has_host_wgpu(self);
    }

    pub fn image(&self) -> Option<&HostImageCapability> {
        return get_host_image(self);
    }

    pub fn input_ingress(&self) -> Option<&HostInputIngressCapability> {
        return get_host_input_ingress(self);
    }

    pub fn lifecycle(&self) -> Option<&HostLifecycleCapability> {
        return get_host_lifecycle(self);
    }

    pub fn net(&self) -> Option<&HostNetCapability> {
        return get_host_net(self);
    }

    pub fn notification_permission(&self) -> Option<&HostNotificationPermissionCapability> {
        return get_host_notification_permission(self);
    }

    pub fn platform(&self) -> Option<&HostPlatformCapability> {
        return get_host_platform(self);
    }

    pub fn power_keep_awake(&self) -> Option<&HostPowerKeepAwakeCapability> {
        return get_host_power_keep_awake(self);
    }

    pub fn preferences(&self) -> Option<&HostPreferencesCapability> {
        return get_host_preferences(self);
    }

    pub fn preferences_persistence_query(
        &self,
    ) -> Option<&HostPreferencesPersistenceQueryCapability> {
        return get_host_preferences_persistence_query(self);
    }

    pub fn screen_query(&self) -> Option<&HostScreenQueryCapability> {
        return get_host_screen_query(self);
    }

    pub fn sensors(&self) -> Option<&HostSensorsCapability> {
        return get_host_sensors(self);
    }

    pub fn socket(&self) -> Option<&HostSocketCapability> {
        return get_host_socket(self);
    }

    pub fn soft_keyboard_info(&self) -> Option<&HostSoftKeyboardInfoCapability> {
        return get_host_soft_keyboard_info(self);
    }

    pub fn text_segmenter(&self) -> Option<&HostTextSegmenterCapability> {
        return get_host_text_segmenter(self);
    }

    pub fn text_shaper(&self) -> Option<&HostTextShaperCapability> {
        return get_host_text_shaper(self);
    }

    pub fn video(&self) -> Option<&HostVideoCapability> {
        return get_host_video(self);
    }

    pub fn wgpu(&self) -> Option<&HostWgpuCapability> {
        return get_host_wgpu(self);
    }
}
