//! The host aggregate and its diagnostic records (TS `types/src/Host.ts`, `HostExplanation.ts`).

use flight_entity::EntityRuntimeSlot;

use flight_accessibility::HostAccessibilityCapabilities;
use flight_app::{HostAppCapabilities, HostFullscreenCapabilities, HostWindowCapabilities};
use flight_audio::HostAudioDecodeCapabilities;
use flight_bitmap::HostBitmapCapabilities;
use flight_clipboard::HostClipboardCapabilities;
use flight_compression::{HostCompressCapabilities, HostDecompressCapabilities};
use flight_connectivity::HostConnectivityCapabilities;
use flight_device::HostDeviceCapabilities;
use flight_dialog::HostDialogCapabilities;
use flight_filesystem::HostFileSystemCapabilities;
use flight_font::{HostFontCapabilities, HostGlyphCapabilities};
use flight_geolocation::HostGeolocationCapabilities;
use flight_haptics::HostHapticsCapabilities;
use flight_image::HostImageCapabilities;
use flight_image_codec::{HostImageDecodeCapabilities, HostImageEncodeCapabilities};
use flight_input::HostInputCapabilities;
use flight_ipc::HostIpcCapabilities;
use flight_keyboard::HostSoftKeyboardCapabilities;
use flight_lifecycle::HostLifecycleCapabilities;
use flight_media::HostAudioCapabilities;
use flight_mediasession::HostMediaSessionCapabilities;
use flight_menu::HostMenuCapabilities;
use flight_midi::HostMidiCapabilities;
use flight_net::HostNetCapabilities;
use flight_notification::HostNotificationCapabilities;
use flight_permissions::HostPermissionsCapabilities;
use flight_platform::HostPlatformCapabilities;
use flight_power::HostPowerCapabilities;
use flight_preferences::HostPreferencesCapabilities;
use flight_protocol::HostProtocolCapabilities;
use flight_screen::HostScreenCapabilities;
use flight_sensors::HostSensorsCapabilities;
use flight_share::HostShareCapabilities;
use flight_shell::HostShellCapabilities;
use flight_shortcut::HostShortcutCapabilities;
use flight_socket::HostSocketCapabilities;
use flight_statusbar::HostStatusBarCapabilities;
use flight_surface::{
    HostCanvasCapabilities, HostGlCapabilities, HostSurfaceCapabilities, HostWgpuCapabilities,
};
use flight_textsegment::HostTextSegmentCapabilities;
use flight_textshaper::HostTextShaperCapabilities;
use flight_tray::HostTrayCapabilities;
use flight_updater::HostUpdaterCapabilities;
use flight_video::HostVideoCapabilities;

/// Every capability group a host carries (TS `Host`, an Entity). Each group is the owning feature's
/// struct of optional slots; an omitted slot is capability absence. A host is built once and handed
/// to the packages that read it.
#[derive(Default)]
pub struct Host {
    runtime: EntityRuntimeSlot,
    pub accessibility: HostAccessibilityCapabilities,
    pub app: HostAppCapabilities,
    pub audio: HostAudioCapabilities,
    pub audio_decode: HostAudioDecodeCapabilities,
    pub bitmap: HostBitmapCapabilities,
    pub canvas: HostCanvasCapabilities,
    pub clipboard: HostClipboardCapabilities,
    pub compress: HostCompressCapabilities,
    pub connectivity: HostConnectivityCapabilities,
    pub decompress: HostDecompressCapabilities,
    pub device: HostDeviceCapabilities,
    pub dialog: HostDialogCapabilities,
    pub file_system: HostFileSystemCapabilities,
    pub font: HostFontCapabilities,
    pub fullscreen: HostFullscreenCapabilities,
    pub geolocation: HostGeolocationCapabilities,
    pub gl: HostGlCapabilities,
    pub glyph: HostGlyphCapabilities,
    pub haptics: HostHapticsCapabilities,
    pub image: HostImageCapabilities,
    pub image_decode: HostImageDecodeCapabilities,
    pub image_encode: HostImageEncodeCapabilities,
    pub input: HostInputCapabilities,
    pub ipc: HostIpcCapabilities,
    pub lifecycle: HostLifecycleCapabilities,
    pub media_session: HostMediaSessionCapabilities,
    pub menu: HostMenuCapabilities,
    pub midi: HostMidiCapabilities,
    pub net: HostNetCapabilities,
    pub notification: HostNotificationCapabilities,
    pub permissions: HostPermissionsCapabilities,
    pub platform: HostPlatformCapabilities,
    pub power: HostPowerCapabilities,
    pub preferences: HostPreferencesCapabilities,
    pub protocol: HostProtocolCapabilities,
    pub screen: HostScreenCapabilities,
    pub sensors: HostSensorsCapabilities,
    pub share: HostShareCapabilities,
    pub shell: HostShellCapabilities,
    pub shortcut: HostShortcutCapabilities,
    pub socket: HostSocketCapabilities,
    pub soft_keyboard: HostSoftKeyboardCapabilities,
    pub status_bar: HostStatusBarCapabilities,
    pub surface: HostSurfaceCapabilities,
    pub text_segment: HostTextSegmentCapabilities,
    pub text_shaper: HostTextShaperCapabilities,
    pub tray: HostTrayCapabilities,
    pub updater: HostUpdaterCapabilities,
    pub video: HostVideoCapabilities,
    pub wgpu: HostWgpuCapabilities,
    pub window: HostWindowCapabilities,
}

/// What a host provides (TS `HostExplanation`): every group it carries with its filled slots, and
/// the covered-slot census, present and missing alike. Plain data.
#[derive(Clone, Debug, PartialEq)]
pub struct HostExplanation {
    pub capabilities: Vec<HostCapabilityCoverage>,
    pub groups: Vec<HostCapabilityGroupExplanation>,
}

/// Where a missing capability can be obtained (TS `HostCapabilityBackend`). `entry_point` is a real
/// exported name, so a reader can grep it.
#[derive(Clone, Debug, PartialEq)]
pub struct HostCapabilityBackend {
    pub entry_point: String,
    pub package_name: String,
    pub platform: String,
}

/// One covered slot's presence (TS `HostCapabilityCoverage`).
#[derive(Clone, Debug, PartialEq)]
pub struct HostCapabilityCoverage {
    pub capability: String,
    pub group: String,
    pub is_present: bool,
    pub slot: String,
}

/// One capability slot's explanation, including where to get it when it is absent (TS
/// `HostCapabilityExplanation`).
#[derive(Clone, Debug, PartialEq)]
pub struct HostCapabilityExplanation {
    pub backends: Vec<HostCapabilityBackend>,
    pub capability: String,
    pub group: String,
    pub is_present: bool,
    pub message: String,
    pub slot: String,
}

/// One group present on a host and its filled slot names (TS `HostCapabilityGroupExplanation`).
#[derive(Clone, Debug, PartialEq)]
pub struct HostCapabilityGroupExplanation {
    pub group: String,
    pub slots: Vec<String>,
}

flight_entity::impl_entity!(Host);
