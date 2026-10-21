//! Host construction (TS `host.ts`). Contract lane only: an app imports a built host rather than
//! constructing one.

use flight_entity::allocate_entity;

use crate::types::Host;
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
use flight_surface::{HostCanvasCapabilities, HostSurfaceCapabilities};
use flight_textsegment::HostTextSegmentCapabilities;
use flight_textshaper::HostTextShaperCapabilities;
use flight_tray::HostTrayCapabilities;
use flight_updater::HostUpdaterCapabilities;
use flight_video::HostVideoCapabilities;

/// Allocates a host with every group empty (TS `createHost`); assign the groups a host provides after
/// create (D23 B). The entity runtime stays unallocated until something binds to it.
// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 21f7557f): assign capability groups after create
pub fn create_host() -> Host {
    let mut out: Host = allocate_entity();
    initialize_host(&mut out);
    return out;
}

/// Resets every capability group to empty (TS `initializeHost`, each group `?? {}`).
// flight-lint: allow(conform-params) D23 (B) zero-field initializer (Principal 21f7557f)
pub fn initialize_host(out: &mut Host) {
    out.accessibility = HostAccessibilityCapabilities::default();
    out.app = HostAppCapabilities::default();
    out.audio = HostAudioCapabilities::default();
    out.audio_decode = HostAudioDecodeCapabilities::default();
    out.bitmap = HostBitmapCapabilities::default();
    out.canvas = HostCanvasCapabilities::default();
    out.clipboard = HostClipboardCapabilities::default();
    out.compress = HostCompressCapabilities::default();
    out.connectivity = HostConnectivityCapabilities::default();
    out.decompress = HostDecompressCapabilities::default();
    out.device = HostDeviceCapabilities::default();
    out.dialog = HostDialogCapabilities::default();
    out.file_system = HostFileSystemCapabilities::default();
    out.font = HostFontCapabilities::default();
    out.fullscreen = HostFullscreenCapabilities::default();
    out.geolocation = HostGeolocationCapabilities::default();
    out.glyph = HostGlyphCapabilities::default();
    out.haptics = HostHapticsCapabilities::default();
    out.image = HostImageCapabilities::default();
    out.image_decode = HostImageDecodeCapabilities::default();
    out.image_encode = HostImageEncodeCapabilities::default();
    out.input = HostInputCapabilities::default();
    out.ipc = HostIpcCapabilities::default();
    out.lifecycle = HostLifecycleCapabilities::default();
    out.media_session = HostMediaSessionCapabilities::default();
    out.menu = HostMenuCapabilities::default();
    out.midi = HostMidiCapabilities::default();
    out.net = HostNetCapabilities::default();
    out.notification = HostNotificationCapabilities::default();
    out.permissions = HostPermissionsCapabilities::default();
    out.platform = HostPlatformCapabilities::default();
    out.power = HostPowerCapabilities::default();
    out.preferences = HostPreferencesCapabilities::default();
    out.protocol = HostProtocolCapabilities::default();
    out.screen = HostScreenCapabilities::default();
    out.sensors = HostSensorsCapabilities::default();
    out.share = HostShareCapabilities::default();
    out.shell = HostShellCapabilities::default();
    out.shortcut = HostShortcutCapabilities::default();
    out.socket = HostSocketCapabilities::default();
    out.soft_keyboard = HostSoftKeyboardCapabilities::default();
    out.status_bar = HostStatusBarCapabilities::default();
    out.surface = HostSurfaceCapabilities::default();
    out.text_segment = HostTextSegmentCapabilities::default();
    out.text_shaper = HostTextShaperCapabilities::default();
    out.tray = HostTrayCapabilities::default();
    out.updater = HostUpdaterCapabilities::default();
    out.video = HostVideoCapabilities::default();
    out.window = HostWindowCapabilities::default();
}
